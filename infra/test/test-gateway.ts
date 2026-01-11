import { SignatureV4 } from '@smithy/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import { defaultProvider } from '@aws-sdk/credential-provider-node';

async function testGateway() {
  const credentials = await defaultProvider()();
  
  const signer = new SignatureV4({
    credentials,
    region: 'ap-northeast-1',
    service: 'bedrock-agentcore',
    sha256: Sha256,
  });

  const gatewayEndpoint = 'https://bedrock-agent-mcp-gateway-zqjrxhhbif.gateway.bedrock-agentcore.ap-northeast-1.amazonaws.com';

  // First, list available tools
  console.log('=== Testing tools/list ===');
  const listRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    params: {}
  };

  const listBody = JSON.stringify(listRequest);
  const listUrl = new URL(`${gatewayEndpoint}/mcp`);
  
  const signedListRequest = await signer.sign({
    method: 'POST',
    hostname: listUrl.hostname,
    path: listUrl.pathname,
    protocol: listUrl.protocol,
    headers: {
      'Content-Type': 'application/json',
      'host': listUrl.hostname,
    },
    body: listBody,
  });

  const listResponse = await fetch(listUrl.toString(), {
    method: 'POST',
    headers: signedListRequest.headers as Record<string, string>,
    body: listBody,
  });

  console.log('Status:', listResponse.status);
  const listResult = await listResponse.json();
  console.log('Response:', JSON.stringify(listResult, null, 2));

  // Then, try calling the tool with prefixed name (3 underscores)
  console.log('\n=== Testing tools/call (prefixed with ___) ===');
  const callRequest = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'current-time-target-v2___getCurrentTime',
      arguments: {}
    }
  };

  const callBody = JSON.stringify(callRequest);
  
  const signedCallRequest = await signer.sign({
    method: 'POST',
    hostname: listUrl.hostname,
    path: listUrl.pathname,
    protocol: listUrl.protocol,
    headers: {
      'Content-Type': 'application/json',
      'host': listUrl.hostname,
    },
    body: callBody,
  });

  const callResponse = await fetch(listUrl.toString(), {
    method: 'POST',
    headers: signedCallRequest.headers as Record<string, string>,
    body: callBody,
  });

  console.log('Status:', callResponse.status);
  const callResult = await callResponse.json();
  console.log('Response:', JSON.stringify(callResult, null, 2));

  // Also try without prefix
  console.log('\n=== Testing tools/call (no prefix) ===');
  const callRequest2 = {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'getCurrentTime',
      arguments: {}
    }
  };

  const callBody2 = JSON.stringify(callRequest2);
  
  const signedCallRequest2 = await signer.sign({
    method: 'POST',
    hostname: listUrl.hostname,
    path: listUrl.pathname,
    protocol: listUrl.protocol,
    headers: {
      'Content-Type': 'application/json',
      'host': listUrl.hostname,
    },
    body: callBody2,
  });

  const callResponse2 = await fetch(listUrl.toString(), {
    method: 'POST',
    headers: signedCallRequest2.headers as Record<string, string>,
    body: callBody2,
  });

  console.log('Status:', callResponse2.status);
  const callResult2 = await callResponse2.json();
  console.log('Response:', JSON.stringify(callResult2, null, 2));
}

testGateway().catch(console.error);
