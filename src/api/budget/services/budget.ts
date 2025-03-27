/**
 * budget service
 */

import { factories, Core } from '@strapi/strapi';
import { Entity } from '@strapi/types/dist/data';
import dayjs, { Dayjs } from 'dayjs';
import { calculateBalance, getFriday } from '../../../x25/budget';
import { AnyDocument } from '@strapi/types/dist/modules/documents';
import { ApiItemItem } from '../../../../types/generated/contentTypes';

export type x25Frequency = "Once" | "Weekly" | "Bi-weekly" | "Monthly";
// export type x25Frequency = keyof typeof ApiItemItem["attributes"]["frequency"]["enum"]
export type x25Item<T extends x25Frequency = x25Frequency> = Entity<"api::item.item"> & {
  frequency: T,
  starts: T extends "Weekly" | "Bi-weekly" | "Monthly" ? Dayjs : never;
  ends: T extends "Weekly" | "Bi-weekly" | "Monthly" ? (Dayjs | "-1") : never;
  date: T extends "Once" ? Dayjs : never;
  dates: T extends "Monthly" ? string[] : never
};

type PaginatedEntities = {
  results: AnyDocument[] | null;
  pagination: {
    page: number;
    pageSize: number | null;
    start?: undefined;
    limit?: undefined;
  } | {
    start: number;
    limit: number;
    page?: undefined;
    pageSize?: undefined;
  };
};

const convertTox25Item = (item: Entity<"api::item.item">): x25Item => {
  if ( item.frequency === "Once" ){
    return {
      ...item,
      date: dayjs(item.date)
    } as x25Item<"Once">
  } else if ( item.frequency === "Monthly" ){
    return {
      ...item,
      starts: dayjs( item.starts ),
      ends: item.ends === "-1" ? "-1" : dayjs( item.ends ),
      dates: item.dates.split(",")
    } as x25Item<"Monthly">
  } else {
    return {
      ...item,
      starts: dayjs( item.starts ),
      ends: item.ends === "-1" ? "-1" : dayjs( item.ends ),
    } as x25Item<"Weekly"|"Bi-weekly">
  }
}

const getBudgetItems = async (documentId: string): Promise<Entity<"api::item.item">[]> => {
  const items: Entity<"api::item.item">[] = await strapi.documents('api::item.item').findMany({
    status: "published",
    filters: {
      budget: {
        documentId: {
          $eq: documentId
        },
      }
    }
  });
  return items;
}

export default factories.createCoreService('api::budget.budget', ({ strapi }: { strapi: Core.Strapi }) => ({
  async find(...args) {
    // const { results, pagination } = await super.find(...args);

    const response: PaginatedEntities = await super.find(...args);
    const { results, pagination } = response;

    // if (results === null) {
    //   return { results, pagination };
    // }

    // for (const budget of results) {      
    //   const items = await getBudgetItems(budget.documentId);

    //   const startdate = dayjs(budget.startDate);
    //   const balance = parseFloat(budget.startAmount);

    //   const x25items = items.map(i => convertTox25Item(i))

    //   // Calculate current balance.
    //   const current = await calculateBalance(startdate, balance, x25items, dayjs());

    //   budget.current = current;
    //   budget.itemCount = items.length;
    // }

    return { results, pagination };
  },

  async findOne(docId, params) {
    const result: AnyDocument|null = await super.findOne(docId, params);
    
    // if ( result ){
    //   const items = await getBudgetItems(result.documentId);

    //   const startdate = dayjs(result.startDate);
    //   const balance = parseFloat(result.startAmount);

    //   const x25items = items.map(i => convertTox25Item(i))

    //   // Calculate current balance.
    //   const current = await calculateBalance(startdate, balance, x25items, dayjs());

    //   // Calculate start of week balance.
    //   const startOfWeek = await calculateBalance(getFriday(startdate), balance, x25items, dayjs());

    //   result.current = current;
    //   result.startOfWeek = startOfWeek;
    //   result.itemCount = items.length;
    // }

    return result;
  },
}));
