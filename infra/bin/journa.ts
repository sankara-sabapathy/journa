#!/usr/bin/env node

import * as cdk from 'aws-cdk-lib'

import { JournaBackendStack } from '../lib/backend-stack'
import { JournaFrontendStack } from '../lib/frontend-stack'

const app = new cdk.App()

new JournaBackendStack(app, 'JournaBackendStack')
new JournaFrontendStack(app, 'JournaFrontendStack')

app.synth()