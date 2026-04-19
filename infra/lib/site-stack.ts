import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as apigwv2Integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cdk from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export interface AppsDebugJoisDevSiteStackProps extends cdk.StackProps {
  domainName: string;
  hostedZoneId: string;
  hostedZoneName: string;
}

export class AppsDebugJoisDevSiteStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AppsDebugJoisDevSiteStackProps) {
    super(scope, id, props);

    const certificateArn = new cdk.CfnParameter(this, "CertificateArn", {
      description: "ACM certificate ARN in us-east-1 for apps.debugjois.dev",
      type: "String",
    });

    const artifactBucketName = new cdk.CfnParameter(this, "ArtifactBucketName", {
      description: "S3 bucket that stores uploaded Lambda zip artifacts",
      type: "String",
    });

    const artifactObjectKey = new cdk.CfnParameter(this, "ArtifactObjectKey", {
      description: "S3 object key for the Lambda deployment zip",
      type: "String",
    });

    const artifactObjectVersion = new cdk.CfnParameter(this, "ArtifactObjectVersion", {
      description: "S3 object version for the Lambda deployment zip",
      type: "String",
    });

    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(
      this,
      "HostedZone",
      {
        hostedZoneId: props.hostedZoneId,
        zoneName: props.hostedZoneName,
      },
    );

    const certificate = acm.Certificate.fromCertificateArn(
      this,
      "Certificate",
      certificateArn.valueAsString,
    );

    const artifactBucket = s3.Bucket.fromBucketName(
      this,
      "ArtifactBucket",
      artifactBucketName.valueAsString,
    );

    // Holds static frontend files uploaded separately from CloudFormation.
    const siteBucket = new s3.Bucket(this, "StaticAssetsBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      versioned: true,
    });

    const siteLambda = new lambda.Function(this, "SiteLambda", {
      code: lambda.Code.fromBucket(
        artifactBucket,
        artifactObjectKey.valueAsString,
        artifactObjectVersion.valueAsString,
      ),
      description: "apps.debugjois.dev Nitro Lambda",
      handler: "server/index.handler",
      memorySize: 1024,
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(30),
    });

    const httpApi = new apigwv2.HttpApi(this, "HttpApi", {
      apiName: "apps-debugjois-dev-api",
      createDefaultStage: true,
      description: "HTTP API for apps.debugjois.dev",
    });

    httpApi.addRoutes({
      integration: new apigwv2Integrations.HttpLambdaIntegration(
        "SiteLambdaIntegration",
        siteLambda,
      ),
      path: "/{proxy+}",
      methods: [apigwv2.HttpMethod.ANY],
    });

    httpApi.addRoutes({
      integration: new apigwv2Integrations.HttpLambdaIntegration(
        "SiteRootLambdaIntegration",
        siteLambda,
      ),
      path: "/",
      methods: [apigwv2.HttpMethod.ANY],
    });

    const apiOrigin = new origins.HttpOrigin(
      cdk.Fn.select(2, cdk.Fn.split("/", httpApi.apiEndpoint)),
      {
        protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
      },
    );

    const staticOrigin = origins.S3BucketOrigin.withOriginAccessControl(siteBucket);

    // Static files that should be served directly from S3.
    const staticBehaviors: Record<string, cloudfront.BehaviorOptions> = {
      "/assets/*": createStaticBehavior(staticOrigin),
      "/favicon.ico": createStaticBehavior(staticOrigin),
      "/logo192.png": createStaticBehavior(staticOrigin),
      "/logo512.png": createStaticBehavior(staticOrigin),
      "/manifest.json": createStaticBehavior(staticOrigin),
      "/robots.txt": createStaticBehavior(staticOrigin),
    };

    const distribution = new cloudfront.Distribution(this, "Distribution", {
      certificate,
      defaultBehavior: {
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        // Honor the origin's Cache-Control header (set per-route by the
        // Nitro Lambda) and include the query string in the cache key so
        // transcripts keyed by ?t=<hash> don't collide.
        cachePolicy:
          cloudfront.CachePolicy.USE_ORIGIN_CACHE_CONTROL_HEADERS_QUERY_STRINGS,
        compress: true,
        origin: apiOrigin,
        originRequestPolicy:
          cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      additionalBehaviors: staticBehaviors,
      domainNames: [props.domainName],
      enabled: true,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,
    });

    new route53.ARecord(this, "AliasRecord", {
      recordName: "apps",
      target: route53.RecordTarget.fromAlias(
        new route53Targets.CloudFrontTarget(distribution),
      ),
      zone: hostedZone,
    });

    new route53.AaaaRecord(this, "AliasRecordIpv6", {
      recordName: "apps",
      target: route53.RecordTarget.fromAlias(
        new route53Targets.CloudFrontTarget(distribution),
      ),
      zone: hostedZone,
    });

    new cdk.CfnOutput(this, "StaticAssetsBucketName", {
      value: siteBucket.bucketName,
      description: "S3 bucket that stores apps.debugjois.dev static assets",
    });

    new cdk.CfnOutput(this, "CloudFrontDistributionId", {
      value: distribution.distributionId,
      description: "CloudFront distribution ID for apps.debugjois.dev",
    });

    new cdk.CfnOutput(this, "CloudFrontDomainName", {
      value: distribution.domainName,
      description: "CloudFront domain for apps.debugjois.dev",
    });

    new cdk.CfnOutput(this, "HttpApiUrl", {
      value: httpApi.apiEndpoint,
      description: "HTTP API endpoint behind CloudFront",
    });

    new cdk.CfnOutput(this, "SiteUrl", {
      value: `https://${props.domainName}`,
      description: "Canonical URL for the deployed app",
    });
  }
}

function createStaticBehavior(origin: cloudfront.IOrigin): cloudfront.BehaviorOptions {
  return {
    allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
    cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
    compress: true,
    origin,
    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
  };
}
