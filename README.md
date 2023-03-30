# Copy AWS IAM role

This is a little script to help with creating a new IAM from an existing one.

Based on: [How to make a copy of AWS IAM role with all its policies](https://www.maxivanov.io/copy-aws-iam-role/).

It will copy trust relationship policy, inline policies and managed polcies (both AWS and customer-managed).

Optionally, it can copy the resources to another account by passing a role to assume as the third argument.

## Usage

You need Node.js to run the script. If you don't have it installed locally, you can run it in Docker.

Since the script calls AWS SDK it expects AWS credentials to be set in environment variables.

```bash
npm install

node copy-role.js SOURCE_ROLE_NAME TARGET_ROLE_NAME [ROLE_TO_ASSUME_ARN]
```

Example output:

```bash
root@7142abe7b6c8:/var/app# node copy-role.js copy-role-poc copy-role-poc-target-role arn:aws:iam::123456789098:role/SomeRole

--> Parsing arguments from command line...
<-- Arguments loaded. Source role name: copy-role-poc, target role name: copy-role-poc-target-role, role to assume: arn:aws:iam::123456789098:role/SomeRole

--> Checking if AWS credentials are loaded...
<-- Credentials found.

--> Fetching source role...
<-- Source role loaded.

--> Fetching inline policies for the role...
<-- Loaded 2 inline policy names.
--> Fetching inline policies...
<-- Loaded inline policies.

--> Fetching managed policies for the role...
<-- Loaded 2 managed policies.

--> Creating a new role copy-role-poc-target-role...
<-- Created role copy-role-poc-target-role.

--> Adding inline policies to copy-role-poc-target-role...
<-- Added 2 inline policies.

--> Adding managed policies to copy-role-poc-target-role...
<-- Added 2 managed policies.
```