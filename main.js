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

/**
 * 
 * @returns getConfig
 */
function getConfig() {
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

  try {
    var orders = fetchOrders(request);
    // check if request contains cart_id, then add abandoned carts info.
    var abandonedCartsData = [];
    console.log("request.fields: ", request.fields);
    if (request.fields.some(field => field.name === "cart_id")) {
      var abandonedCarts = fetchAbandonedCarts(request);
      abandonedCartsData = getAbandonedCartsData(abandonedCarts, requestedFields);
    }

    var ordersData = getOrdersData(orders, requestedFields);
  } catch (e) {
    cc.newUserError()
      .setDebugText("Error fetching data from API. Exception details: " + e)
      .setText(
        "The connector has encountered an unrecoverable error. Please try again later, or file an issue if this error persists."
      )
      .throwException();
  }

  return {
    schema: requestedFields.build(),
    rows: ordersData.concat(abandonedCartsData),
  };
}

/**
 * Fetches abandoned carts from Magento API.
 *
 * @param {Object} request Data request parameters.
 * @returns {string} Response text for UrlFetchApp.
 */
function fetchAbandonedCarts(request) {
  const magentoBaseUrl = request.configParams.magentoBaseUrl;
  const apiToken = request.configParams.apiToken;

  // Validate input configuration
  if (!magentoBaseUrl || !apiToken) {
    sendUserError("Magento Base URL and API Token must be configured.");
    return;
  }

  console.log("fetchAbandonedCarts request: ", request);

  const cartsEndpoint = "/rest/V1/carts/search";
  const startDate = request.dateRange.startDate;
  const endDate =
    request.dateRange.endDate || new Date().toISOString().split("T")[0]; // Default end date

  // Build API request URL with filters
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

  const options = {
    method: "get",
    headers: {
      Authorization: "Bearer " + apiToken,
      "Content-Type": "application/json",
    },
  };

  try {
    // Fetch data from Magento API
    var response = UrlFetchApp.fetch(fullUrl, options);
    return response;
  } catch (error) {
    sendUserError("Error fetching data: " + error.message);
    return null;
  }
}

/**
 * Gets response for UrlFetchApp.
 *
 * @param {Object} request Data request parameters.
 * @returns {string} Response text for UrlFetchApp.
 */
function fetchOrders(request) {
  const magentoBaseUrl = request.configParams.magentoBaseUrl; // "https://boutique.milleniummicro.ca/sto_fr";
  const apiToken = request.configParams.apiToken; //"Ttrs413wvfnbzbvxsbreu2cy3wu9tcnx"

  // Validate input configuration
  if (!magentoBaseUrl || !apiToken) {
    sendUserError("Magento Base URL and API Token must be configured.");
    return;
  }

  const ordersEndpoint = "/rest/V1/orders";
  const startDate = request.dateRange.startDate;
  const endDate =
    request.dateRange.endDate || new Date().toISOString().split("T")[0]; // Default end date

  // Build API request URL with filters
  const queryParams = [
    "searchCriteria[filter_groups][0][filters][0][field]=created_at",
    "searchCriteria[filter_groups][0][filters][0][value]=" + startDate,
    "searchCriteria[filter_groups][0][filters][0][condition_type]=from",
    "searchCriteria[filter_groups][0][filters][1][field]=created_at",
    "searchCriteria[filter_groups][0][filters][1][value]=" + endDate,
    "searchCriteria[filter_groups][0][filters][1][condition_type]=to",
  ];
  const fullUrl = magentoBaseUrl + ordersEndpoint + "?" + queryParams.join("&");

  const options = {
    method: "get",
    headers: {
      Authorization: "Bearer " + apiToken,
      "Content-Type": "application/json",
    },
  };

  try {
    // Fetch data from Magento API
    var response = UrlFetchApp.fetch(fullUrl, options);
    return response;
  } catch (error) {
    sendUserError("Error fetching data: " + error.message);
    return null;
  }
}

/**
 * Formats the parsed response from external data source into correct tabular
 * format and returns only the requestedFields
 *
 * @param {Object} parsedResponse The response string from external data source
 *     parsed into an object in a standard format.
 * @param {Array} requestedFields The fields requested in the getData request.
 * @returns {Array} Array containing rows of data in key-value pairs for each
 *     field.
 */
function getOrdersData(response, requestedFields) {
  var data = [];
  const jsonResponse = JSON.parse(response.getContentText());
  const orders = jsonResponse.items;
  var data = orders.map((order) => {
    return formatOrderData(requestedFields, order);
  });
  return data;
}

/**
 * Extracts and formats abandoned cart data from the given response.
 *
 * @param {Object} response - The HTTP response object containing the abandoned cart data.
 * @param {Array} requestedFields - The fields requested for the abandoned cart data.
 * @returns {Array} An array of formatted abandoned cart data.
 */

function getAbandonedCartsData(response, requestedFields) {
  var data = [];
  const jsonResponse = JSON.parse(response.getContentText());
  const abandonedCarts = jsonResponse.items;
  var data = abandonedCarts.map((abandonedCart) => {
    return formatAbandonedCartData(requestedFields, abandonedCart);

  });
  return data;
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
    /**
     {
    "items": [
        {
            "id": 10131,
            "created_at": "2024-12-24 05:21:58",
            "updated_at": "2024-12-24 05:36:57",
            "is_active": true,
            "is_virtual": false,
            "items": [
                {
                    "item_id": 10600,
                    "sku": "6236510",
                    "qty": 1,
                    "name": "Repose-poignets & Tapis de souris | TUF | NC13 TUF GAMING P1 | ASUS TUF GAMING P1 PORTABLE GAMING MOUSE PAD",
                    "price": 42.97,
                    "product_type": "simple",
                    "quote_id": "10131"
                },
                {
                    "item_id": 10601,
                    "sku": "7706119",
                    "qty": 1,
                    "name": "Portable de jeu 16po | Lenovo Legion Pro 7 16IRX9H | i9-14900HX | 32 Go | NVIDIA GeForce RTX 4090 16 Go | 2 To SSD | Windows 11 Pro | Anglais (USA)",
                    "price": 4929.97,
                    "product_type": "simple",
                    "quote_id": "10131"
                },
                {
                    "item_id": 10604,
                    "sku": "7926317",
                    "qty": 1,
                    "name": "Gaming Mouse | Wireless | Logitech | LIGHTSPEED G G309 | White | Bluetooth",
                    "price": 111.97,
                    "product_type": "simple",
                    "quote_id": "10131"
                }
            ],
            "items_count": 3,
            "items_qty": 3,
            "customer": {
                "id": 460,
                "group_id": 1,
                "default_shipping": "225",
                "created_at": "2024-12-24 05:21:36",
                "updated_at": "2024-12-24 05:37:38",
                "created_in": "FR",
                "email": "tchakountisohd@gmail.com",
                "firstname": "Bryan Darnel",
                "lastname": "Tchakounti",
                "store_id": 5,
                "website_id": 3,
                "addresses": [
                    {
                        "id": 225,
                        "customer_id": 460,
                        "region": {
                            "region_code": "QC",
                            "region": "Québec",
                            "region_id": 76
                        },
                        "region_id": 76,
                        "country_id": "CA",
                        "street": [
                            "38 Rue Desmarchais",
                            "Appartment 3"
                        ],
                        "telephone": "4389218652",
                        "postcode": "J4J 2X9",
                        "city": "Longueuil",
                        "firstname": "Bryan Darnel",
                        "lastname": "Tchakounti",
                        "default_shipping": true
                    }
                ],
                "disable_auto_group_change": 0,
                "extension_attributes": {
                    "is_subscribed": false
                }
            },
            "billing_address": {
                "id": 22275,
                "region": "Québec",   //oui
                "region_id": 76,
                "region_code": "QC",    //oui
                "country_id": "CA",
                "street": [
                    "38 Rue Desmarchais",  
                    "Appartment 3"
                ],
                "telephone": "4389218652",
                "postcode": "J4J 2X9",
                "city": "Longueuil",  //oui
                "firstname": "Bryan Darnel",
                "lastname": "Tchakounti",
                "customer_id": 460,
                "email": "tchakountisohd@gmail.com",
                "same_as_billing": 0,
                "customer_address_id": 225,
                "save_in_address_book": 1
            },
            "orig_order_id": 0,
            "currency": {
                "global_currency_code": "CAD",
                "base_currency_code": "CAD",
                "store_currency_code": "CAD",
                "quote_currency_code": "CAD",
                "store_to_base_rate": 0,
                "store_to_quote_rate": 0,
                "base_to_global_rate": 1,
                "base_to_quote_rate": 1
            },
            "customer_is_guest": false,
            "customer_note_notify": true,
            "customer_tax_class_id": 3,
            "store_id": 5,
            "extension_attributes": {
                "shipping_assignments": [
                    {
                        "shipping": {
                            "address": {
                                "id": 22274,
                                "region": "Québec",
                                "region_id": 76,
                                "region_code": "QC",
                                "country_id": "CA",
                                "street": [
                                    "38 Rue Desmarchais",
                                    "Appartment 3"
                                ],
                                "telephone": "4389218652",
                                "postcode": "J4J 2X9",
                                "city": "Longueuil",
                                "firstname": "Bryan Darnel",
                                "lastname": "Tchakounti",
                                "customer_id": 460,
                                "email": "tchakountisohd@gmail.com",
                                "same_as_billing": 1,
                                "customer_address_id": 225,
                                "save_in_address_book": 1
                            },
                            "method": "standardshipping_standardshipping"
                        },
                        "items": [
                            {
                                "item_id": 10600,
                                "sku": "6236510",
                                "qty": 1,
                                "name": "Repose-poignets & Tapis de souris | TUF | NC13 TUF GAMING P1 | ASUS TUF GAMING P1 PORTABLE GAMING MOUSE PAD",
                                "price": 42.97,
                                "product_type": "simple",
                                "quote_id": "10131"
                            },
                            {
                                "item_id": 10601,
                                "sku": "7706119",
                                "qty": 1,
                                "name": "Portable de jeu 16po | Lenovo Legion Pro 7 16IRX9H | i9-14900HX | 32 Go | NVIDIA GeForce RTX 4090 16 Go | 2 To SSD | Windows 11 Pro | Anglais (USA)",
                                "price": 4929.97,
                                "product_type": "simple",
                                "quote_id": "10131"
                            },
                            {
                                "item_id": 10604,
                                "sku": "7926317",
                                "qty": 1,
                                "name": "Gaming Mouse | Wireless | Logitech | LIGHTSPEED G G309 | White | Bluetooth",
                                "price": 111.97,
                                "product_type": "simple",
                                "quote_id": "10131"
                            }
                        ]
                    }
                ]
            }
        }
    ],
    "search_criteria": {
        "filter_groups": [
            {
                "filters": [
                    {
                        "field": "is_active",
                        "value": "1",
                        "condition_type": "eq"
                    }
                ]
            },
            {
                "filters": [
                    {
                        "field": "store_id",
                        "value": "0",
                        "condition_type": "neq"
                    }
                ]
            },
            {
                "filters": [
                    {
                        "field": "items_count",
                        "value": "0",
                        "condition_type": "gt"
                    }
                ]
            },
            {
                "filters": [
                    {
                        "field": "customer_id",
                        "value": "null",
                        "condition_type": "neq"
                    }
                ]
            }
        ],
        "page_size": 1
    },
    "total_count": 2
}
     */
    
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
