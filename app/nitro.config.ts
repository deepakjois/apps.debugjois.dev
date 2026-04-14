import { defineNitroConfig } from "nitro/config";

export default defineNitroConfig({
  preset: "aws_lambda",
  awsLambda: {
    streaming: true,
  },
});
