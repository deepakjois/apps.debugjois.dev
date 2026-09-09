import { defineNitroConfig } from "nitro/config";

export default defineNitroConfig({
  preset: "aws_lambda",
  awsLambda: {
    // API Gateway HTTP API expects the standard Lambda proxy shape here.
    streaming: false,
  },
});
