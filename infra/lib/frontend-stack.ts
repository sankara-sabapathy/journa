import * as cdk from 'aws-cdk-lib'
import { Duration, Stack, StackProps } from 'aws-cdk-lib'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as s3 from 'aws-cdk-lib/aws-s3'
import { Construct } from 'constructs'

const GITHUB_REPO = 'sankara-sabapathy/journa'

export class JournaFrontendStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    const siteBucket = new s3.Bucket(this, 'JournaSiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
    })

    const distribution = new cloudfront.Distribution(this, 'JournaSiteDistribution', {
      comment: 'Journa PWA hosting',
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.seconds(0),
        },
      ],
    })

    const githubProvider = new iam.OpenIdConnectProvider(this, 'GitHubActionsProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    })

    const deployRole = new iam.Role(this, 'GitHubDeployRole', {
      roleName: 'journa-github-deploy',
      assumedBy: new iam.WebIdentityPrincipal(githubProvider.openIdConnectProviderArn, {
        StringLike: { 'token.actions.githubusercontent.com:sub': `repo:${GITHUB_REPO}:*` },
        StringEquals: { 'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com' },
      }),
    })
    siteBucket.grantReadWrite(deployRole)
    distribution.grantCreateInvalidation(deployRole)
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['cloudformation:DescribeStacks'],
        resources: [this.stackId],
      }),
    )

    new cdk.CfnOutput(this, 'SiteBucketName', { value: siteBucket.bucketName })
    new cdk.CfnOutput(this, 'DistributionId', { value: distribution.distributionId })
    new cdk.CfnOutput(this, 'DeployRoleArn', { value: deployRole.roleArn })
  }
}