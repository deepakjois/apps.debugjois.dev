import * as cdk from "aws-cdk-lib";

import { AppsDebugJoisDevAccessStack } from "../lib/access-stack";
import { AppsDebugJoisDevArtifactStack } from "../lib/artifact-stack";
import { AppsDebugJoisDevCertificateStack } from "../lib/certificate-stack";
import { AppsDebugJoisDevSiteStack } from "../lib/site-stack";

const app = new cdk.App({ analyticsReporting: false });
const account = process.env.CDK_DEFAULT_ACCOUNT ?? "654654546088";
const synthesizer = new cdk.LegacyStackSynthesizer();

// Shared deployment settings for the apps.debugjois.dev stack family.
const appConfig = {
  domainName: "apps.debugjois.dev",
  hostedZoneId: "Z00045403RW6YB0MUHDBN",
  hostedZoneName: "debugjois.dev",
};

new AppsDebugJoisDevArtifactStack(app, "AppsDebugJoisDevArtifactStack", {
  analyticsReporting: false,
  env: {
    account,
    region: "us-west-2",
  },
  synthesizer,
});

new AppsDebugJoisDevAccessStack(app, "AppsDebugJoisDevAccessStack", {
  analyticsReporting: false,
  env: {
    account,
    region: "us-west-2",
  },
  synthesizer,
});

new AppsDebugJoisDevCertificateStack(app, "AppsDebugJoisDevCertificateStack", {
  analyticsReporting: false,
  env: {
    account,
    region: "us-east-1",
  },
  synthesizer,
  ...appConfig,
});

new AppsDebugJoisDevSiteStack(app, "AppsDebugJoisDevSiteStack", {
  analyticsReporting: false,
  env: {
    account,
    region: "us-west-2",
  },
  synthesizer,
  ...appConfig,
});
