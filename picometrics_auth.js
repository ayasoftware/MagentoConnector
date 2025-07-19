// Global definitions
const scriptProperties = PropertiesService.getScriptProperties();
const picoBearerToken = scriptProperties.getProperty('picometricsApiKey');
const picoBaseUrl = scriptProperties.getProperty('picoBaseUrl');
const DEBUG = true; // Set to true or false to enable/disable logging

function debugLog(...args) {
  if (DEBUG) {
    console.log(...args);
  }
}

function incrementApiCalls(email, sku) {
  const apiUrl = picoBaseUrl + "api/increment-api-calls";
  const options = {
    method: "post",
    headers: {
      "Authorization": "Bearer " + picoBearerToken,
      "Content-Type": "application/json"
    },
    payload: JSON.stringify({ email: email, sku: sku }),
  };
  try {
    var response = UrlFetchApp.fetch(apiUrl, options);
    debugLog('incrementApiCalls response:', response);
    var statusCode = response.getResponseCode();
    debugLog('Status code:', statusCode);
    if (statusCode === 200) {
      return { incremented: true };
    }
  } catch (error) {
    throwUserError(error);
  }
}

function updateConnectedAccounts(email, account_name, account_identifier, sku) {
  if (!email || !account_name || !account_identifier) {
    return {
      code: 400,
      body: { error: "Missing required fields" }
    };
  }
  const apiUrl = picoBaseUrl + "api/updateConnectedAccounts";
  const options = {
    method: "post",
    headers: {
      "Authorization": "Bearer " + picoBearerToken,
      "Content-Type": "application/json"
    },
    payload: JSON.stringify({
      email: email,
      account_name: account_name,
      account_identifier: account_identifier,
      sku: sku
    }),
    muteHttpExceptions: true
  };
  try {
    var response = UrlFetchApp.fetch(apiUrl, options);
    var result = JSON.parse(response.getContentText());
    debugLog('updateConnectedAccounts result:', result);
    if (result.updated) {
      return { updated: true };
    }
    if (result.created) {
      return { created: true };
    }
    if (result.error) {
      return { error: result.error };
    }
  } catch (error) {
    throwUserError(error);
  }
}

function checkSubscription(email, sku) {
  const apiUrl = picoBaseUrl + "api/verifyUser";
  const options = {
    method: "post",
    headers: {
      "Authorization": "Bearer " + picoBearerToken,
      "Content-Type": "application/json"
    },
    payload: JSON.stringify({ email: email, sku: sku }),
    muteHttpExceptions: true
  };
  try {
    var response = UrlFetchApp.fetch(apiUrl, options);
    var result = JSON.parse(response.getContentText());
    debugLog('checkSubscription result:', result);

    if (result.free_access) {
      return { grant_access: true };
    }

    if (result) {
      if (result.trialStatus?.trial) {
        return {
          grant_access: true,
          token_limit: result.token_limit,
          accounts_limit: result.accounts_limit,
          connectedAccountsCount: result.connectedAccountsCount,
          usedApiCalls: result.usedApiCalls,
          apicalls_limit: result.apicalls_limit
        };
      }
      if (
        result.stripeSubscriptionStatus &&
        result.stripeSubscriptionStatus.hasActiveSubscription
      ) {
        return {
          grant_access: true,
          token_limit: result.token_limit,
          accounts_limit: result.accounts_limit,
          connectedAccountsCount: result.connectedAccountsCount,
          usedApiCalls: result.usedApiCalls,
          apicalls_limit: result.apicalls_limit
        };
      }
    }
    return { grant_access: false };
  } catch (error) {
    throwUserError('error');
  }
}
