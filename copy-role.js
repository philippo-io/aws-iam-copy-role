const AWS = require("aws-sdk")

;(async () => {
    try {
        const [sourceRoleName, targetRoleName, roleToAssumeArn] = loadArguments()

        checkAwsCredentials()

        const iamSrc = new AWS.IAM()
        const credentialsDest = roleToAssumeArn ? await getCredentials(roleToAssumeArn) : null
        const iamDst = new AWS.IAM(credentialsDest)

        const sourceRole = await fetchRole(iamSrc, sourceRoleName)
        const inlinePolicies = await fetchInlinePolicies(iamSrc, sourceRoleName)
        const managedPolicies = await fetchManagedPolicies(iamSrc, sourceRoleName)
        
        await createRoleFromExisting(iamDst, sourceRole, targetRoleName)
        
        if (inlinePolicies.length > 0) {
            await addInlinePolicies(iamDst, targetRoleName, inlinePolicies)
        }

        if (managedPolicies.length > 0) {
            await addManagedPolicies(iamDst, targetRoleName, managedPolicies)
        }

        log('\nDone!')
    } catch (e) {
        error(e.message)
    }
})()

function loadArguments() {
    log('\n--> Parsing arguments from command line...')
    
    const cmdArgs = process.argv.slice(2)
    if (cmdArgs.length < 2) {
        throw new TypeError("<-- Usage: node copy-role.js SOURCE_ROLE_NAME TARGET_ROLE_NAME [ROLE_TO_ASSUME_ARN]")
    }

    log(`<-- Arguments loaded. Source role name: ${cmdArgs[0]}, target role name: ${cmdArgs[1]}, role to assume: ${cmdArgs.length >= 3 ? cmdArgs[2] : "-"}`)
    return cmdArgs
}

function checkAwsCredentials() {
    log('\n--> Checking if AWS credentials are loaded...')
    
    if (!AWS.config.credentials) {
        throw new Error(`<-- Failed to find AWS credentials. Consider providing them with environment variables.`)
    }

    log('<-- AWS credentials found.')
}

async function fetchRole(iam, roleName) {
    log('\n--> Fetching source role...')

    let role
    try {
        role = (await iam.getRole({RoleName: roleName}).promise()).Role
    } catch (e) {
        throw new Error(`<-- Failed to fetch source role: "${e.message}"`)
    }

    log('<-- Source role loaded.')

    return role
}

async function fetchInlinePolicies(iam, roleName) {
    log(`\n--> Fetching inline policy names for ${roleName}...`)

    let inlinePolicyNames
    try {
        inlinePolicyNames = await fetchInlinePoliciesRecursive()
    } catch (e) {
        throw new Error(`<-- Failed to fetch inline policy names: "${e.message}"`)
    }

    log(`<-- Loaded ${inlinePolicyNames.length} inline policy names.`)

    if (inlinePolicyNames.length === 0) {
        return []
    }

    log('--> Fetching inline policies...')

    let inlinePolies = []

    try {
        for (const inlinePolicyName of inlinePolicyNames) {
            inlinePolies.push(await iam.getRolePolicy({RoleName: roleName, PolicyName: inlinePolicyName}).promise())
        }
    } catch (e) {
        throw new Error(`<-- Failed to fetch inline policy: "${e.message}"`)
    }

    log(`<-- Loaded inline policies.`)

    return inlinePolies

    async function fetchInlinePoliciesRecursive(marker) {
        let inlinePolicyNames
        
        const response = await iam.listRolePolicies({RoleName: roleName, Marker: marker}).promise()
        inlinePolicyNames = response.PolicyNames

        if (response.IsTruncated) {
            inlinePolicyNames = inlinePolicyNames.concat(await fetchInlinePoliciesRecursive(response.Marker))
        }

        return inlinePolicyNames
    }
}

async function fetchManagedPolicies(iam, roleName) {
    log(`\n--> Fetching managed policies for ${roleName}...`)

    let managedPolicies
    try {
        managedPolicies = await fetchManagedPoliciesRecursive()
    } catch (e) {
        throw new Error(`<-- Failed to fetch managed policies: "${e.message}"`)
    }

    log(`<-- Loaded ${managedPolicies.length} managed policies.`)

    return managedPolicies

    async function fetchManagedPoliciesRecursive(marker) {
        let managedPolicies
        
        const response = await iam.listAttachedRolePolicies({RoleName: roleName, Marker: marker}).promise()
        managedPolicies = response.AttachedPolicies

        if (response.IsTruncated) {
            managedPolicies = managedPolicies.concat(await fetchManagedPoliciesRecursive(response.Marker))
        }

        return managedPolicies
    }
}

async function createRoleFromExisting(iam, sourceRole, targetRoleName) {
    log(`\n--> Creating a new role ${targetRoleName}...`)

    let targetRole
    try {
        targetRole = (await iam.createRole({
            Path: sourceRole.Path,
            RoleName: targetRoleName,
            AssumeRolePolicyDocument: decodeURIComponent(sourceRole.AssumeRolePolicyDocument),
            Description: sourceRole.Description,
            MaxSessionDuration: sourceRole.MaxSessionDuration,
            PermissionsBoundary: sourceRole.PermissionsBoundary ? sourceRole.PermissionsBoundary.PermissionsBoundaryArn: undefined,
            Tags: sourceRole.Tags,
        }).promise()).Role
    } catch (e) {
        throw new Error(`<-- Failed to create target role: "${e.message}"`)
    }

    log(`<-- Created role ${targetRoleName}.`)

    return targetRole
}

async function addInlinePolicies(iam, targetRoleName, policies) {
    log(`\n--> Adding inline policies to ${targetRoleName}...`)

    try {
        for (const policy of policies) {
            await iam.putRolePolicy({
                RoleName: targetRoleName,
                PolicyName: policy.PolicyName,
                PolicyDocument: decodeURIComponent(policy.PolicyDocument),
            }).promise()
        }
    } catch (e) {
        throw new Error(`<-- Failed to add inline policies: "${e.message}"`)
    }

    log(`<-- Added ${policies.length} inline policies.`)
}

async function addManagedPolicies(iam, targetRoleName, policies) {
    log(`\n--> Adding managed policies to ${targetRoleName}...`)

    try {
        for (const policy of policies) {
            await iam.attachRolePolicy({
                RoleName: targetRoleName,
                PolicyArn: policy.PolicyArn,
            }).promise()
        }
    } catch (e) {
        throw new Error(`<-- Failed to add managed policies: "${e.message}"`)
    }

    log(`<-- Added ${policies.length} managed policies.`)
}

async function getCredentials(roleToAssume) {
    if (!roleToAssume) {
        return
    }

    return await assumeRole(roleToAssume)
}

async function assumeRole(roleArn) {
    try {
        const data = await (new AWS.STS()).assumeRole({
            RoleArn: roleArn,
            RoleSessionName: `aws-iam-copy-role-${(new Date()).getTime()}`
        }).promise()

        return {
            accessKeyId: data.Credentials.AccessKeyId,
            secretAccessKey: data.Credentials.SecretAccessKey,
            sessionToken: data.Credentials.SessionToken,
        }
    } catch (e) {
        throw new Error(`<-- Failed to assume role ${roleArn}: "${e.message}"`)
    }
}

function log(message) {
    console.log(message)
}

function error(message) {
    console.log(`                                          
              ████████████                                                        
            ████  ██████████                                                      
            ████████████████                                                      
            ████████                                                    ████      
            ████████████                                                ████      
██        ████████                                                      ████      
████    ██████████████                                ████        ████  ████  ████
██████████████████  ██                                ████  ██    ████  ████  ████
██████████████████                                    ████  ██    ████  ████  ████
  ████████████████                                ██  ████  ██    ████  ████  ████
    ████████████                                  ██  ████████    ████████████████
      ████████                                    ██  ████          ████████████  
      ████  ██                                    ████████              ████      
      ██    ██      ████          ████                ████              ████      
      ████  ████  ██    ██      ██    ██              ████              ████      
  ████████████████        ██████        ████████████  ████  ██████████  ████  ████
                    ████          ████                ████              ████      
    ████                    ████        ████                ████  ████            
                ████                            ████                          ████
`)
    console.error(message)
    process.exitCode = 1
}