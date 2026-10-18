import * as cdk from 'aws-cdk-lib'
import { Duration, Stack, StackProps } from 'aws-cdk-lib'
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2'
import * as authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers'
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import * as cognito from 'aws-cdk-lib/aws-cognito'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as wafv2 from 'aws-cdk-lib/aws-wafv2'
import * as path from 'node:path'
import { Construct } from 'constructs'

const AUTOMATIC_BACKUP_RETENTION = Duration.days(90)

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
      encryption: dynamodb.TableEncryptionV2.awsManagedKey(),
      localSecondaryIndexes: [
        {
          indexName: 'bySeq',
          sortKey: { name: 'seq', type: dynamodb.AttributeType.NUMBER },
        },
      ],
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
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

    const syncFunction = new nodejs.NodejsFunction(this, 'JournaSyncFunction', {
      functionName: `${scopeTag}-sync`,
      entry: path.resolve(__dirname, '..', '..', 'functions', 'sync.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(15),
      reservedConcurrentExecutions: 20,
      environment: {
        TABLE_NAME: table.tableName,
        BACKUPS_BUCKET_NAME: backups.bucketName,
        USER_POOL_ID: userPool.userPoolId,
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node22',
      },
    })

    table.grantReadWriteData(syncFunction)
    backups.grantReadWrite(syncFunction)
    syncFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['cognito-idp:AdminDeleteUser'],
        resources: [userPool.userPoolArn],
      }),
    )

    const authorizer = new authorizers.HttpJwtAuthorizer('JournaAuthorizer', `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`, {
      authorizerName: `${scopeTag}-jwt`,
      identitySource: ['$request.header.Authorization'],
      jwtAudience: [client.userPoolClientId],
    })

    const httpApi = new apigwv2.HttpApi(this, 'JournaApi', {
      apiName: `${scopeTag}-sync-api`,
      corsPreflight: {
        allowOrigins: ['https://d22yyqrvp3iqn6.cloudfront.net'],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.DELETE,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['authorization', 'content-type', 'x-amz-date', 'x-amz-security-token'],
      },
      defaultAuthorizer: authorizer,
    })

    httpApi.addRoutes({
      path: '/v1/sync',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration('SyncRoute', syncFunction),
    })

    httpApi.addRoutes({
      path: '/v1/backups/presign',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration('PresignRoute', syncFunction),
    })

    httpApi.addRoutes({
      path: '/v1/backups',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration('ListBackupsRoute', syncFunction),
    })

    httpApi.addRoutes({
      path: '/v1/backups/{name}',
      methods: [apigwv2.HttpMethod.DELETE],
      integration: new integrations.HttpLambdaIntegration('DeleteBackupRoute', syncFunction),
    })

    httpApi.addRoutes({
      path: '/v1/devices',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration('ListDevicesRoute', syncFunction),
    })

    httpApi.addRoutes({
      path: '/v1/devices/{id}',
      methods: [apigwv2.HttpMethod.PUT],
      integration: new integrations.HttpLambdaIntegration('UpsertDeviceRoute', syncFunction),
    })

    httpApi.addRoutes({
      path: '/v1/devices/{id}',
      methods: [apigwv2.HttpMethod.DELETE],
      integration: new integrations.HttpLambdaIntegration('RevokeDeviceRoute', syncFunction),
    })

    httpApi.addRoutes({
      path: '/v1/devices/{id}/dek',
      methods: [apigwv2.HttpMethod.PUT],
      integration: new integrations.HttpLambdaIntegration('PutDekRoute', syncFunction),
    })

    httpApi.addRoutes({
      path: '/v1/devices/{id}/dek',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration('GetDekRoute', syncFunction),
    })

    httpApi.addRoutes({
      path: '/v1/account',
      methods: [apigwv2.HttpMethod.DELETE],
      integration: new integrations.HttpLambdaIntegration('DeleteAccountRoute', syncFunction),
    })

    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId })
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: client.userPoolClientId })
    new cdk.CfnOutput(this, 'BackendApiUrl', { value: httpApi.apiEndpoint })
    new cdk.CfnOutput(this, 'EntriesTableName', { value: table.tableName })
    new cdk.CfnOutput(this, 'BackupsBucketName', { value: backups.bucketName })

    const webAcl = new wafv2.CfnWebACL(this, 'JournaApiWebAcl', {
      scope: 'REGIONAL',
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'journa-api',
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: 'RateLimitPerIp',
          priority: 0,
          action: { block: {} },
          statement: {
            rateBasedStatement: { limit: 1000, aggregateKeyType: 'IP' },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'journa-api-rate-limit',
            sampledRequestsEnabled: true,
          },
        },
      ],
    })

    new wafv2.CfnWebACLAssociation(this, 'JournaApiWebAclAssociation', {
      resourceArn: `arn:aws:apigateway:${this.region}::/apis/${httpApi.apiId}/stages/$default`,
      webAclArn: webAcl.attrArn,
    })
  }
}