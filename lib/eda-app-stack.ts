import * as cdk from "aws-cdk-lib";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as events from "aws-cdk-lib/aws-lambda-event-sources";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as iam from "aws-cdk-lib/aws-iam";

import { Construct } from "constructs";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class EDAAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const sourceBucket = new s3.Bucket(this, "translationSource", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
    });

    const resultBucket = new s3.Bucket(this, "translationResult", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
    });

    // Integration infrastructure

    const translationProcessQueue = new sqs.Queue(this, "txt-created-queue", {
      receiveMessageWaitTime: cdk.Duration.seconds(10),
    });

    const mailerQ = new sqs.Queue(this, "mailer-queue", {
      receiveMessageWaitTime: cdk.Duration.seconds(10),
    });

    const newTranslationTopic = new sns.Topic(this, "NewTranslationTopic", {
      displayName: "New Translation topic",
    }); 

    const completeTranslationTopic = new sns.Topic(this, "CompleteTranslationTopic", {
      displayName: "Complete Translation topic",
    }); 

    newTranslationTopic.addSubscription(
      new subs.SqsSubscription(translationProcessQueue)
    );

    completeTranslationTopic.addSubscription(
      new subs.SqsSubscription(mailerQ)
    );

    // Lambda functions

    const translateFn = new lambdanode.NodejsFunction(
      this,
      "translateFn",
      {
        runtime: lambda.Runtime.NODEJS_18_X,
        entry: `${__dirname}/../lambdas/translateText.ts`,
        timeout: cdk.Duration.seconds(15),
        memorySize: 128,
        environment: {
          RESULT_BUCKET: resultBucket.bucketName,
        },
      }
    );

    const mailerFn = new lambdanode.NodejsFunction(this, "mailer-function", {
      runtime: lambda.Runtime.NODEJS_16_X,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(3),
      entry: `${__dirname}/../lambdas/mailer.ts`,
    });

    //IAM policy to grant access to translate
    const translatePolicyStatement = new iam.PolicyStatement({
      actions: ['translate:TranslateText'],
      resources: ['*'], // Adjust as needed
    });

    //IAM Policy to grant auto language detection
    const comprehendPolicyStatement = new iam.PolicyStatement({
      actions: ['comprehend:DetectDominantLanguage'],
      resources: ['*'], // Adjust as needed
    });

    translateFn.role?.attachInlinePolicy(new iam.Policy(this, 'TranslatePolicy',{
      statements: [translatePolicyStatement, comprehendPolicyStatement]
    }))

    //Event triggers

    sourceBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SnsDestination(newTranslationTopic)
    );

    resultBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SnsDestination(completeTranslationTopic)
    )

    //when message enters iamge Process queue, trigger added lambdas
    const newTranslationEventSource = new events.SqsEventSource(translationProcessQueue, {
      batchSize: 5,
      maxBatchingWindow: cdk.Duration.seconds(10),
    });

    const newTranslationMailEventSource = new events.SqsEventSource(mailerQ, {
      batchSize: 5,
      maxBatchingWindow: cdk.Duration.seconds(10),
    }); 

    translateFn.addEventSource(newTranslationEventSource);
    mailerFn.addEventSource(newTranslationMailEventSource);

    // Permissions

    sourceBucket.grantRead(translateFn);
    resultBucket.grantReadWrite(translateFn);

    mailerFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ses:SendEmail",
          "ses:SendRawEmail",
          "ses:SendTemplatedEmail",
        ],
        resources: ["*"],
      })
    );


    // Output

    new cdk.CfnOutput(this, "bucketName", {
      value: sourceBucket.bucketName,
    });
  }
}
