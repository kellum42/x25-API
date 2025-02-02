/**
 * budget service
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreService('api::budget.budget', ({ strapi }) => ({
  async find(...args) {  
    const { results, pagination } = await super.find(...args);

    // List item count when pulling budgets.
    for (const result of results) {
      // Calculate today's budget.

      const items = await strapi.documents('api::item.item').count({ 
        status: "published",
        filters: {
          budget: {
            documentId: {
              $eq: result.documentId
            },
          },
        },
      });
  
      result.items = items;
    };

    return { results, pagination };
  }
}));
