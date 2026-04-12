import { CreateInventoryLevelInput, ExecArgs } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils";
import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
  createApiKeysWorkflow,
  createInventoryLevelsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateStoresStep,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows";
import { ApiKey } from "../../.medusa/types/query-entry-points";

const updateStoreCurrencies = createWorkflow(
  "update-store-currencies",
  (input: {
    supported_currencies: { currency_code: string; is_default?: boolean }[];
    store_id: string;
  }) => {
    const normalizedInput = transform({ input }, (data) => {
      return {
        selector: { id: data.input.store_id },
        update: {
          supported_currencies: data.input.supported_currencies.map(
            (currency) => {
              return {
                currency_code: currency.currency_code,
                is_default: currency.is_default ?? false,
              };
            }
          ),
        },
      };
    });

    const stores = updateStoresStep(normalizedInput);

    return new WorkflowResponse(stores);
  }
);

export default async function seedDemoData({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT);
  const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL);
  const storeModuleService = container.resolve(Modules.STORE);

  const countries = ["mn", "kr"];

  logger.info("Seeding store data...");
  const [store] = await storeModuleService.listStores();
  let defaultSalesChannel = await salesChannelModuleService.listSalesChannels({
    name: "Default Sales Channel",
  });

  if (!defaultSalesChannel.length) {
    const { result: salesChannelResult } = await createSalesChannelsWorkflow(
      container
    ).run({
      input: {
        salesChannelsData: [
          {
            name: "Default Sales Channel",
          },
        ],
      },
    });
    defaultSalesChannel = salesChannelResult;
  }

  await updateStoreCurrencies(container).run({
    input: {
      store_id: store.id,
      supported_currencies: [
        {
          currency_code: "mnt",
          is_default: true,
        },
        {
          currency_code: "krw",
        },
      ],
    },
  });

  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: {
        default_sales_channel_id: defaultSalesChannel[0].id,
      },
    },
  });
  logger.info("Seeding region data...");
  const { result: regionResult } = await createRegionsWorkflow(container).run({
    input: {
      regions: [
        {
          name: "Монгол",
          currency_code: "mnt",
          countries: ["mn"],
          payment_providers: ["pp_system_default"],
        },
        {
          name: "South Korea",
          currency_code: "krw",
          countries: ["kr"],
          payment_providers: ["pp_system_default"],
        },
      ],
    },
  });
  const regionMN = regionResult[0];
  const regionKR = regionResult[1];
  logger.info("Finished seeding regions.");

  logger.info("Seeding tax regions...");
  await createTaxRegionsWorkflow(container).run({
    input: countries.map((country_code) => ({
      country_code,
      provider_id: "tp_system",
    })),
  });
  logger.info("Finished seeding tax regions.");

  logger.info("Seeding stock location data...");
  const { result: stockLocationResult } = await createStockLocationsWorkflow(
    container
  ).run({
    input: {
      locations: [
        {
          name: "Улаанбаатар агуулах",
          address: {
            city: "Ulaanbaatar",
            country_code: "MN",
            address_1: "",
          },
        },
      ],
    },
  });
  const stockLocation = stockLocationResult[0];

  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: {
        default_location_id: stockLocation.id,
      },
    },
  });

  await link.create({
    [Modules.STOCK_LOCATION]: {
      stock_location_id: stockLocation.id,
    },
    [Modules.FULFILLMENT]: {
      fulfillment_provider_id: "manual_manual",
    },
  });

  logger.info("Seeding fulfillment data...");
  const shippingProfiles = await fulfillmentModuleService.listShippingProfiles({
    type: "default",
  });
  let shippingProfile = shippingProfiles.length ? shippingProfiles[0] : null;

  if (!shippingProfile) {
    const { result: shippingProfileResult } =
      await createShippingProfilesWorkflow(container).run({
        input: {
          data: [
            {
              name: "Default Shipping Profile",
              type: "default",
            },
          ],
        },
      });
    shippingProfile = shippingProfileResult[0];
  }

  const fulfillmentSet = await fulfillmentModuleService.createFulfillmentSets({
    name: "Хүргэлт",
    type: "shipping",
    service_zones: [
      {
        name: "Монгол & Солонгос",
        geo_zones: [
          {
            country_code: "mn",
            type: "country",
          },
          {
            country_code: "kr",
            type: "country",
          },
        ],
      },
    ],
  });

  await link.create({
    [Modules.STOCK_LOCATION]: {
      stock_location_id: stockLocation.id,
    },
    [Modules.FULFILLMENT]: {
      fulfillment_set_id: fulfillmentSet.id,
    },
  });

  await createShippingOptionsWorkflow(container).run({
    input: [
      {
        name: "Энгийн хүргэлт",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: fulfillmentSet.service_zones[0].id,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "Энгийн",
          description: "2-3 өдөрт хүргэнэ.",
          code: "standard",
        },
        prices: [
          {
            currency_code: "mnt",
            amount: 5000,
          },
          {
            currency_code: "krw",
            amount: 3000,
          },
          {
            region_id: regionMN.id,
            amount: 5000,
          },
          {
            region_id: regionKR.id,
            amount: 3000,
          },
        ],
        rules: [
          {
            attribute: "enabled_in_store",
            value: "true",
            operator: "eq",
          },
          {
            attribute: "is_return",
            value: "false",
            operator: "eq",
          },
        ],
      },
      {
        name: "Шуурхай хүргэлт",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: fulfillmentSet.service_zones[0].id,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "Шуурхай",
          description: "24 цагт хүргэнэ.",
          code: "express",
        },
        prices: [
          {
            currency_code: "mnt",
            amount: 10000,
          },
          {
            currency_code: "krw",
            amount: 5000,
          },
          {
            region_id: regionMN.id,
            amount: 10000,
          },
          {
            region_id: regionKR.id,
            amount: 5000,
          },
        ],
        rules: [
          {
            attribute: "enabled_in_store",
            value: "true",
            operator: "eq",
          },
          {
            attribute: "is_return",
            value: "false",
            operator: "eq",
          },
        ],
      },
    ],
  });
  logger.info("Finished seeding fulfillment data.");

  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: {
      id: stockLocation.id,
      add: [defaultSalesChannel[0].id],
    },
  });
  logger.info("Finished seeding stock location data.");

  logger.info("Seeding publishable API key data...");
  let publishableApiKey: ApiKey | null = null;
  const { data } = await query.graph({
    entity: "api_key",
    fields: ["id"],
    filters: {
      type: "publishable",
    },
  });

  publishableApiKey = data?.[0];

  if (!publishableApiKey) {
    const {
      result: [publishableApiKeyResult],
    } = await createApiKeysWorkflow(container).run({
      input: {
        api_keys: [
          {
            title: "Webshop",
            type: "publishable",
            created_by: "",
          },
        ],
      },
    });

    publishableApiKey = publishableApiKeyResult as ApiKey;
  }

  await linkSalesChannelsToApiKeyWorkflow(container).run({
    input: {
      id: publishableApiKey.id,
      add: [defaultSalesChannel[0].id],
    },
  });
  logger.info("Finished seeding publishable API key data.");

  logger.info("Seeding product data...");

  const { result: categoryResult } = await createProductCategoriesWorkflow(
    container
  ).run({
    input: {
      product_categories: [
        {
          name: "Цамц",
          is_active: true,
        },
        {
          name: "Хүрэм",
          is_active: true,
        },
        {
          name: "Өмд",
          is_active: true,
        },
        {
          name: "Бусад",
          is_active: true,
        },
      ],
    },
  });

  await createProductsWorkflow(container).run({
    input: {
      products: [
        {
          title: "Футболк",
          category_ids: [
            categoryResult.find((cat) => cat.name === "Цамц")!.id,
          ],
          description: "Өдөр тутмын хөнгөн цамц.",
          handle: "t-shirt",
          weight: 400,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [
            {
              url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-black-front.png",
            },
            {
              url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-white-front.png",
            },
          ],
          options: [
            {
              title: "Размер",
              values: ["S", "M", "L", "XL"],
            },
            {
              title: "Өнгө",
              values: ["Хар", "Цагаан"],
            },
          ],
          variants: [
            {
              title: "S / Хар",
              sku: "TS-S-BLK",
              options: { "Размер": "S", "Өнгө": "Хар" },
              prices: [
                { amount: 35000, currency_code: "mnt" },
                { amount: 15000, currency_code: "krw" },
              ],
            },
            {
              title: "S / Цагаан",
              sku: "TS-S-WHT",
              options: { "Размер": "S", "Өнгө": "Цагаан" },
              prices: [
                { amount: 35000, currency_code: "mnt" },
                { amount: 15000, currency_code: "krw" },
              ],
            },
            {
              title: "M / Хар",
              sku: "TS-M-BLK",
              options: { "Размер": "M", "Өнгө": "Хар" },
              prices: [
                { amount: 35000, currency_code: "mnt" },
                { amount: 15000, currency_code: "krw" },
              ],
            },
            {
              title: "M / Цагаан",
              sku: "TS-M-WHT",
              options: { "Размер": "M", "Өнгө": "Цагаан" },
              prices: [
                { amount: 35000, currency_code: "mnt" },
                { amount: 15000, currency_code: "krw" },
              ],
            },
            {
              title: "L / Хар",
              sku: "TS-L-BLK",
              options: { "Размер": "L", "Өнгө": "Хар" },
              prices: [
                { amount: 35000, currency_code: "mnt" },
                { amount: 15000, currency_code: "krw" },
              ],
            },
            {
              title: "L / Цагаан",
              sku: "TS-L-WHT",
              options: { "Размер": "L", "Өнгө": "Цагаан" },
              prices: [
                { amount: 35000, currency_code: "mnt" },
                { amount: 15000, currency_code: "krw" },
              ],
            },
            {
              title: "XL / Хар",
              sku: "TS-XL-BLK",
              options: { "Размер": "XL", "Өнгө": "Хар" },
              prices: [
                { amount: 35000, currency_code: "mnt" },
                { amount: 15000, currency_code: "krw" },
              ],
            },
            {
              title: "XL / Цагаан",
              sku: "TS-XL-WHT",
              options: { "Размер": "XL", "Өнгө": "Цагаан" },
              prices: [
                { amount: 35000, currency_code: "mnt" },
                { amount: 15000, currency_code: "krw" },
              ],
            },
          ],
          sales_channels: [{ id: defaultSalesChannel[0].id }],
        },
        {
          title: "Хүрэм",
          category_ids: [
            categoryResult.find((cat) => cat.name === "Хүрэм")!.id,
          ],
          description: "Дулаахан хүрэм.",
          handle: "sweatshirt",
          weight: 400,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [
            {
              url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/sweatshirt-vintage-front.png",
            },
          ],
          options: [
            {
              title: "Размер",
              values: ["S", "M", "L", "XL"],
            },
          ],
          variants: [
            {
              title: "S",
              sku: "SW-S",
              options: { "Размер": "S" },
              prices: [
                { amount: 65000, currency_code: "mnt" },
                { amount: 28000, currency_code: "krw" },
              ],
            },
            {
              title: "M",
              sku: "SW-M",
              options: { "Размер": "M" },
              prices: [
                { amount: 65000, currency_code: "mnt" },
                { amount: 28000, currency_code: "krw" },
              ],
            },
            {
              title: "L",
              sku: "SW-L",
              options: { "Размер": "L" },
              prices: [
                { amount: 65000, currency_code: "mnt" },
                { amount: 28000, currency_code: "krw" },
              ],
            },
            {
              title: "XL",
              sku: "SW-XL",
              options: { "Размер": "XL" },
              prices: [
                { amount: 65000, currency_code: "mnt" },
                { amount: 28000, currency_code: "krw" },
              ],
            },
          ],
          sales_channels: [{ id: defaultSalesChannel[0].id }],
        },
        {
          title: "Өмд",
          category_ids: [
            categoryResult.find((cat) => cat.name === "Өмд")!.id,
          ],
          description: "Тав тухтай өмд.",
          handle: "sweatpants",
          weight: 400,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [
            {
              url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/sweatpants-gray-front.png",
            },
          ],
          options: [
            {
              title: "Размер",
              values: ["S", "M", "L", "XL"],
            },
          ],
          variants: [
            {
              title: "S",
              sku: "PT-S",
              options: { "Размер": "S" },
              prices: [
                { amount: 55000, currency_code: "mnt" },
                { amount: 24000, currency_code: "krw" },
              ],
            },
            {
              title: "M",
              sku: "PT-M",
              options: { "Размер": "M" },
              prices: [
                { amount: 55000, currency_code: "mnt" },
                { amount: 24000, currency_code: "krw" },
              ],
            },
            {
              title: "L",
              sku: "PT-L",
              options: { "Размер": "L" },
              prices: [
                { amount: 55000, currency_code: "mnt" },
                { amount: 24000, currency_code: "krw" },
              ],
            },
            {
              title: "XL",
              sku: "PT-XL",
              options: { "Размер": "XL" },
              prices: [
                { amount: 55000, currency_code: "mnt" },
                { amount: 24000, currency_code: "krw" },
              ],
            },
          ],
          sales_channels: [{ id: defaultSalesChannel[0].id }],
        },
        {
          title: "Богино өмд",
          category_ids: [
            categoryResult.find((cat) => cat.name === "Бусад")!.id,
          ],
          description: "Зуны богино өмд.",
          handle: "shorts",
          weight: 400,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [
            {
              url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/shorts-vintage-front.png",
            },
          ],
          options: [
            {
              title: "Размер",
              values: ["S", "M", "L", "XL"],
            },
          ],
          variants: [
            {
              title: "S",
              sku: "SH-S",
              options: { "Размер": "S" },
              prices: [
                { amount: 45000, currency_code: "mnt" },
                { amount: 20000, currency_code: "krw" },
              ],
            },
            {
              title: "M",
              sku: "SH-M",
              options: { "Размер": "M" },
              prices: [
                { amount: 45000, currency_code: "mnt" },
                { amount: 20000, currency_code: "krw" },
              ],
            },
            {
              title: "L",
              sku: "SH-L",
              options: { "Размер": "L" },
              prices: [
                { amount: 45000, currency_code: "mnt" },
                { amount: 20000, currency_code: "krw" },
              ],
            },
            {
              title: "XL",
              sku: "SH-XL",
              options: { "Размер": "XL" },
              prices: [
                { amount: 45000, currency_code: "mnt" },
                { amount: 20000, currency_code: "krw" },
              ],
            },
          ],
          sales_channels: [{ id: defaultSalesChannel[0].id }],
        },
      ],
    },
  });
  logger.info("Finished seeding product data.");

  logger.info("Seeding inventory levels.");

  const { data: inventoryItems } = await query.graph({
    entity: "inventory_item",
    fields: ["id"],
  });

  const inventoryLevels: CreateInventoryLevelInput[] = [];
  for (const inventoryItem of inventoryItems) {
    const inventoryLevel = {
      location_id: stockLocation.id,
      stocked_quantity: 1000000,
      inventory_item_id: inventoryItem.id,
    };
    inventoryLevels.push(inventoryLevel);
  }

  await createInventoryLevelsWorkflow(container).run({
    input: {
      inventory_levels: inventoryLevels,
    },
  });

  logger.info("Finished seeding inventory levels data.");
}
