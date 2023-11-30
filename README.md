## Cloud Computing 1 - Lambda Exercise

To run this code, ensure that Node is installed, and run the following comands:

```
npm install
cdk deploy
```

In *env.ts*, replace the **SES_EMAIL_FROM** and **SES_EMAIL_TO** with SES identities verified with your AWS account. Also change the **SES_REGION** as neccessary.


If the AWS CDK has not been configured before on the system, install the AWS CLI and run the following commands to retrieve your AWS account caller ID and boostrap the AWS CDK:
```
aws sts get-caller-identity --query "YourAccount" --output text
cdk bootstrap aws://YOUR-ACCOUNT-NUMBER/eu-west-1
```
_________
Disclaimer: This CloudFormation Stack uses code obtained from the Distributed Systems module.