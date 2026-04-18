import * as cdk from "aws-cdk-lib";

import { AppsDebugJoisDevArtifactStack } from "../lib/artifact-stack";
import { AppsDebugJoisDevCertificateStack } from "../lib/certificate-stack";
import { AppsDebugJoisDevSiteStack } from "../lib/site-stack";

const app = new cdk.App();
const account = process.env.CDK_DEFAULT_ACCOUNT ?? "654654546088";
const synthesizer = new cdk.LegacyStackSynthesizer();

// Shared deployment settings for the apps.debugjois.dev stack family.
const appConfig = {
  domainName: "apps.debugjois.dev",
  hostedZoneId: "Z00045403RW6YB0MUHDBN",
  hostedZoneName: "debugjois.dev",
};

new AppsDebugJoisDevArtifactStack(app, "AppsDebugJoisDevArtifactStack", {
  env: {
    account,
    region: "us-west-2",
  },
  synthesizer,
});

new AppsDebugJoisDevCertificateStack(app, "AppsDebugJoisDevCertificateStack", {
  env: {
    account,
    region: "us-east-1",
  },
  synthesizer,
  ...appConfig,
});

new AppsDebugJoisDevSiteStack(app, "AppsDebugJoisDevSiteStack", {
  env: {
    account,
    region: "us-west-2",
  },
  synthesizer,
  ...appConfig,
});
