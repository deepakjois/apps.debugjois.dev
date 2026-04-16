import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cdk from "aws-cdk-lib";
import * as route53 from "aws-cdk-lib/aws-route53";
import { Construct } from "constructs";

export interface AppsDebugJoisDevCertificateStackProps extends cdk.StackProps {
  domainName: string;
  hostedZoneId: string;
  hostedZoneName: string;
}

export class AppsDebugJoisDevCertificateStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    props: AppsDebugJoisDevCertificateStackProps,
  ) {
    super(scope, id, props);

    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(
      this,
      "HostedZone",
      {
        hostedZoneId: props.hostedZoneId,
        zoneName: props.hostedZoneName,
      },
    );

    const certificate = new acm.Certificate(this, "Certificate", {
      domainName: props.domainName,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    new cdk.CfnOutput(this, "CertificateArn", {
      value: certificate.certificateArn,
      description: "ACM certificate ARN for apps.debugjois.dev",
    });
  }
}
