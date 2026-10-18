import * as cdk from 'aws-cdk-lib'
import { Duration, Stack, StackProps } from 'aws-cdk-lib'
import * as cognito from 'aws-cdk-lib/aws-cognito'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as s3 from 'aws-cdk-lib/aws-s3'
import { Construct } from 'constructs'

const AUTOMATIC_BACKUP_RETENTION = Duration.days(90)

/**
 * Journa backend on Lambda Web Functions: one Hono app serves the whole API
 * behind a public HTTPS endpoint with native per-endpoint rate limiting.
 * No API Gateway, no WAF, no per-request gateway charges.
 */
export class JournaBackendStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    const scopeTag = 'journa'

    const userPool = new cognito.UserPool(this, 'JournaUserPool', {
      userPoolName: `${scopeTag}-users`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      standardAttributes: {
        email: { required: true, mutable: false },
      },
      mfa: cognito.Mfa.OPTIONAL,
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      featurePlan: cognito.FeaturePlan.ESSENTIALS,
      signInPolicy: {
        allowedFirstAuthFactors: {
          password: true,
          emailOtp: true,
          passkey: true,
        },
      },
      passwordPolicy: {
        minLength: 14,
        requireDigits: true,
        requireLowercase: true,
        requireUppercase: true,
        requireSymbols: true,
        tempPasswordValidity: Duration.days(3),
      },
    })

    const client = userPool.addClient('JournaUserPoolClient', {
      userPoolClientName: `${scopeTag}-web`,
      generateSecret: false,
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
      authFlows: {
        user: true,
      },
    })

    const table = new dynamodb.TableV2(this, 'JournaEntriesTable', {
      tableName: `${scopeTag}-entries`,
      billing: dynamodb.Billing.onDemand({
        maxReadRequestUnits: 10,
        maxWriteRequestUnits: 10,
      }),
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      localSecondaryIndexes: [
        {
          indexName: 'bySeq',
          sortKey: { name: 'seq', type: dynamodb.AttributeType.NUMBER },
        },
      ],
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      timeToLiveAttribute: 'expiresAt',
      encryption: dynamodb.TableEncryptionV2.awsManagedKey(),
      deletionProtection: true,
    })

    const backups = new s3.Bucket(this, 'JournaBackupsBucket', {
      bucketName: undefined,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: false,
      lifecycleRules: [
        {
          id: 'expire-old-backups',
          expiration: AUTOMATIC_BACKUP_RETENTION,
        },
      ],
    })

    const codeBucket = s3.Bucket.fromBucketName(this, 'WebCodeBucket', `journa-webcode-${this.account}`)

    const codeKey = new cdk.CfnParameter(this, 'WebCodeKey', {
      type: 'String',
      description: 'S3 key of the web function bundle inside the code bucket (uploaded by CI)',
    })

    const executionRole = new iam.Role(this, 'WebFunctionExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    })
    table.grantReadWriteData(executionRole)
    backups.grantReadWrite(executionRole)
    executionRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['cognito-idp:AdminDeleteUser'],
        resources: [userPool.userPoolArn],
      }),
    )
    executionRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
    )

    const webFunction = new cdk.CfnResource(this, 'JournaWebFunction', {
      type: 'AWS::Lambda::WebFunction',
      properties: { FunctionName: `${scopeTag}-api` },
    })

    const revision = new cdk.CfnResource(this, 'JournaWebRevision', {
      type: 'AWS::Lambda::WebFunctionRevision',
      properties: {
        FunctionName: webFunction.ref,
        BuildConfig: {
          CodeConfig: {
            S3Object: { Bucket: codeBucket.bucketName, Key: codeKey.valueAsString },
          },
          RuntimeConfig: { Runtime: 'nodejs24.x' },
        },
        ServiceConfig: {
          ExecutionRoleArn: executionRole.roleArn,
          TimeoutSeconds: 15,
          MaxConcurrencyPerEnvironment: 64,
          EnvironmentVariables: {
            TABLE_NAME: table.tableName,
            BACKUPS_BUCKET_NAME: backups.bucketName,
            USER_POOL_ID: userPool.userPoolId,
            JOURNA_AWS_REGION: this.region,
          },
          TelemetryConfig: {
            LoggingConfig: { ApplicationLogLevel: 'INFO', SystemLogLevel: 'WARN' },
          },
        },
      },
    })

    const endpoint = new cdk.CfnResource(this, 'JournaWebEndpoint', {
      type: 'AWS::Lambda::WebFunctionEndpoint',
      properties: {
        FunctionName: webFunction.ref,
        EndpointName: 'prod',
        EndpointType: 'HomeRegion',
        AuthType: 'ApplicationManaged',
        RevisionWeights: [{ RevisionId: revision.getAtt('RevisionId'), Weight: 100 }],
        ThrottleConfig: { RateLimit: 100 },
        ScalingConfig: { MaxEnvironments: 2 },
      },
    })

    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId })
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: client.userPoolClientId })
    new cdk.CfnOutput(this, 'BackendApiUrl', { value: `https://${endpoint.getAtt('DomainName').toString()}` })
    new cdk.CfnOutput(this, 'EntriesTableName', { value: table.tableName })
    new cdk.CfnOutput(this, 'BackupsBucketName', { value: backups.bucketName })
  }
}
