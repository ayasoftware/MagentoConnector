// Copyright 2017 Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * @fileoverview Community Connector for npm package download count data. This
 * can retrieve download count for one or multiple packages from npm by date.
 *
 */

var cc = DataStudioApp.createCommunityConnector();
var DEFAULT_PACKAGE = "googleapis";

/**
 * Sends an error message to Looker Studio for user feedback.
 *
 * @param {string} message The error message to display.
 */
function sendUserError(message) {
  cc.newUserError().setText(message).throwException();
}

function getAuthType() {
  var AuthTypes = cc.AuthType;
  return cc.newAuthTypeResponse()
    .setAuthType(AuthTypes.OAUTH2)
    .build();
}

function resetAuth() {
  getOAuthService().reset();
}

function isAuthValid() {
  return true;
}

/**
 * 
 * @returns getConfig
 */
function getConfig() {

  var email = Session.getActiveUser().getEmail();
  const connectorSku = scriptProperties.getProperty('connectorSku');
  const accesGranted = checkSubscription(email, connectorSku);
    if (accesGranted && !accesGranted.grant_access) {
        sendUserError('Please visit picometrics.io to purchase your subscription to our connector or contact us if you have any questions.');
    }
    var config = cc.getConfig();

  // Add Magento Base URL configuration
  config
    .newTextInput()
    .setId("magentoBaseUrl")
    .setName("Magento Base URL")
    .setHelpText(
      "Enter the base URL of your Magento store. Example: https://your-magento-site.com"
    )
    .setPlaceholder("https://your-magento-site.com")
    .setAllowOverride(true);

  // Add API Token configuration
  config
    .newTextInput()
    .setId("apiToken")
    .setName("Magento API Token")
    .setHelpText("Enter your Magento Admin API Token.")
    .setPlaceholder("Paste your API token here")
    .setAllowOverride(true);

  config.setDateRangeRequired(true);

  return config.build();
}
// [END get_config]

// [START get_schema]
function getFields() {
  var fields = cc.getFields();
  var types = cc.FieldType;

  fields
    .newDimension()
    .setId("order_id")
    .setName("Order ID")
    .setType(types.TEXT);

  fields
    .newDimension()
    .setId("customer_email")
    .setName("Customer email")
    .setType(types.TEXT);

  fields
    .newMetric()
    .setId("grand_total")
    .setName("Grand total")
    .setType(types.NUMBER)
    .setIsReaggregatable(true);

  fields
    .newMetric()
    .setId("applied_taxes_total")
    .setName("Tax Collected")
    .setType(types.NUMBER)
    .setIsReaggregatable(true);

  fields
    .newDimension()
    .setId("created_at")
    .setName("Order date")
    .setType(types.YEAR_MONTH_DAY);

  fields
    .newDimension()
    .setId("cart_id")
    .setName("Cart ID")
    .setType(types.NUMBER);

  fields
    .newDimension()
    .setId("abandoned_at")
    .setName("Abandoned At")
    .setType(types.YEAR_MONTH_DAY);

  fields
    .newMetric()
    .setId("items_count")
    .setName("Items Count")
    .setType(types.NUMBER);

  fields
    .newMetric()
    .setId("abandoned_total")
    .setName("Abandoned Total")
    .setType(types.NUMBER)
    .setIsReaggregatable(true);

  fields
    .newDimension()
    .setId("province")
    .setName("Province")
    .setType(types.TEXT);

  fields
    .newDimension()
    .setId("city")
    .setName("City")
    .setType(types.TEXT);

  return fields;
}


/**
 * 
 * @param {NewType} request 
 * @returns 
 */
function getSchema(request) {
  console.log("getSchema request: ", request.dimensions);
  return { schema: getFields().build() };
}

// [END get_schema]
/**
 * 
 * @param {*} request 
 * @returns 
 */
function getData(request) {
  var requestedFields = getFields().forIds(
    request.fields.map(function (field) {
      return field.name;
    })
  );

  var orders = fetchOrders(request);
  // check if request contains cart_id, then add abandoned carts info.
  var abandonedCartsData = [];
  console.log("request.fields: ", request.fields);
  if (request.fields.some(field => field.name === "cart_id")) {
    var abandonedCarts = fetchAbandonedCarts(request);
    abandonedCartsData = getAbandonedCartsData(abandonedCarts, requestedFields);
  }

  var ordersData = getOrdersData(orders, requestedFields);

  return {
    schema: requestedFields.build(),
    rows: ordersData.concat(abandonedCartsData),
  };
}

/**
 * Fetches abandoned carts from Magento API via a proxy.
 *
 * @param {Object} request Data request parameters.
 * @returns {Object} The parsed JSON response from the API.
 */
function fetchAbandonedCarts(request) {
  const magentoBaseUrl = request.configParams.magentoBaseUrl;
  const apiToken = request.configParams.apiToken;

  if (!magentoBaseUrl || !apiToken) {
    sendUserError("Magento Base URL and API Token must be configured.");
  }

  const cartsEndpoint = "/rest/V1/carts/search";
  const startDate = request.dateRange.startDate;
  const endDate =
    request.dateRange.endDate || new Date().toISOString().split("T")[0];

  const queryParams = [
    "searchCriteria[filter_groups][0][filters][0][field]=created_at",
    "searchCriteria[filter_groups][0][filters][0][value]=" + startDate,
    "searchCriteria[filter_groups][0][filters][0][condition_type]=from",
    "searchCriteria[filter_groups][0][filters][1][field]=created_at",
    "searchCriteria[filter_groups][0][filters][1][value]=" + endDate,
    "searchCriteria[filter_groups][0][filters][1][condition_type]=to",
    "searchCriteria[filter_groups][1][filters][0][field]=is_active",
    "searchCriteria[filter_groups][1][filters][0][value]=1",
    "searchCriteria[filter_groups][1][filters][0][condition_type]=eq",
  ];
  const fullUrl = magentoBaseUrl + cartsEndpoint + "?" + queryParams.join("&");

  const proxyUrl = "https://picometrics.io/api";
  const payload = {
    url: fullUrl,
    headers: {
      Authorization: "Bearer " + apiToken,
      "Content-Type": "application/json",
    },
    method: "get"
  };

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
  };

  try {
    const response = UrlFetchApp.fetch(proxyUrl, options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();

    if (responseCode !== 200) {
      sendUserError('Error fetching abandoned carts. API responded with status ' + responseCode + ': ' + responseBody);
    }
    return JSON.parse(responseBody);
  } catch (error) {
    sendUserError("Error fetching or parsing abandoned carts data: " + error.message);
  }
}

/**
 * Gets response for UrlFetchApp.
 *
 * @param {Object} request Data request parameters.
 * @returns {Object} The parsed JSON response from the API.
 */
function fetchOrders(request) {
  const magentoBaseUrl = request.configParams.magentoBaseUrl;
  const apiToken = request.configParams.apiToken;

  if (!magentoBaseUrl || !apiToken) {
    sendUserError("Magento Base URL and API Token must be configured.");
  }

  const ordersEndpoint = "/rest/V1/orders";
  const startDate = request.dateRange.startDate;
  const endDate =
    request.dateRange.endDate || new Date().toISOString().split("T")[0];

  const queryParams = [
    "searchCriteria[filter_groups][0][filters][0][field]=created_at",
    "searchCriteria[filter_groups][0][filters][0][value]=" + startDate,
    "searchCriteria[filter_groups][0][filters][0][condition_type]=from",
    "searchCriteria[filter_groups][0][filters][1][field]=created_at",
    "searchCriteria[filter_groups][0][filters][1][value]=" + endDate,
    "searchCriteria[filter_groups][0][filters][1][condition_type]=to",
  ];
  const fullUrl = magentoBaseUrl + ordersEndpoint + "?" + queryParams.join("&");

  const proxyUrl = "https://picometrics.io/api";
  const payload = {
    url: fullUrl,
    headers: {
      Authorization: "Bearer " + apiToken,
      "Content-Type": "application/json",
    },
    method: "get"
  };

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
  };

  try {
    const response = UrlFetchApp.fetch(proxyUrl, options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();

    if (responseCode !== 200) {
      sendUserError('Error fetching orders. API responded with status ' + responseCode + ': ' + responseBody);
    }
    return JSON.parse(responseBody);
  } catch (error) {
    sendUserError("Error fetching or parsing orders data: " + error.message);
  }
}

/**
 * Formats the parsed response from external data source into correct tabular
 * format and returns only the requestedFields
 *
 * @param {Object} jsonResponse The parsed JSON response from the API.
 * @param {Array} requestedFields The fields requested in the getData request.
 * @returns {Array} Array containing rows of data in key-value pairs for each
 *     field.
 */
function getOrdersData(jsonResponse, requestedFields) {
  const orders = jsonResponse.items;
  return orders.map((order) => {
    return formatOrderData(requestedFields, order);
  });
}

/**
 * Extracts and formats abandoned cart data from the given response.
 *
 * @param {Object} jsonResponse The parsed JSON response from the API.
 * @param {Array} requestedFields - The fields requested for the abandoned cart data.
 * @returns {Array} An array of formatted abandoned cart data.
 */
function getAbandonedCartsData(jsonResponse, requestedFields) {
  const abandonedCarts = jsonResponse.items;
  return abandonedCarts.map((abandonedCart) => {
    return formatAbandonedCartData(requestedFields, abandonedCart);
  });
}
// [END get_data]

function isAdminUser() {
  return false;
}

function formatAbandonedCartData(requestedFields, abandonedCart) {
  var row = requestedFields.asArray().map(function (requestedField) {
    var fieldId = requestedField.getId();
    switch (fieldId) {
      case "cart_id":
        return abandonedCart.id;
      case "abandoned_at":
        return abandonedCart.updated_at.split(" ")[0].replace(/-/g, "");
      case "items_count":
        return parseInt(abandonedCart.items_count || 0);
      case "abandoned_total":
        return abandonedCart.items.reduce((total, item) => total + item.price, 0);
      default:
        return "";
    }
  });
  return { values: row };
}

/**
 *
 * @param {*} requestedFields
 * @param {*} order
 * @returns
 */
function formatOrderData(requestedFields, order) {
  var row = requestedFields.asArray().map(function (requestedField) {
    var fieldId = requestedField.getId();
    switch (fieldId) {
      case "grand_total":
        return parseFloat(order.grand_total || 0);
      case "order_id":
        return order.increment_id;
      case "customer_email":
        return order.customer_email;
      case "created_at":
        return order.created_at.split(" ")[0].replace(/-/g, "");
      case "applied_taxes_total":
        if (order.items && Array.isArray(order.items)) {
          return order.items.reduce(function (total, item) {
            if (item.applied_taxes && Array.isArray(item.applied_taxes)) {
              return total + item.applied_taxes.reduce(function (taxTotal, tax) {
                return taxTotal + (tax.amount || 0);
              }, 0);
            }
            return total;
          }, 0);
        }
        return 0;
      case "city":
        return order.billing_address ? order.billing_address.city : "";
      case "province":
        return order.billing_address ? order.billing_address.region : "";
      default:
        return "";
    }
  });
  return { values: row };
}
