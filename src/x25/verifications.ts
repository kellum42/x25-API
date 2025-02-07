
import { Core } from '@strapi/strapi';
import { Dayjs } from 'dayjs'
import { Entity } from '@strapi/types/dist/data';
import { x25Item } from '../api/budget/services/budget';

type Item = Entity<"api::item.item">;

export const getVerificationOn = async (date: Dayjs, item: Item, strapi: Core.Strapi): Promise<number | null> => {
  const verification = await strapi.documents('api::verification.verification').findFirst({
    status: "published",
    filters: {
      item: {
        documentId: {
          $eq: item.documentId
        }
      },
      date: {
        $eq: date.format("YYYY-MM-DD")
      }
    }
  });

  if (verification) {
    return verification.amount
  }
  return null;
}


export const getVerificationsBetween = async (dates: [Dayjs, Dayjs], item: x25Item, strapi: Core.Strapi): Promise<Entity<"api::verification.verification">[]> => {
  const start = dates[0];
  const end = dates[1];

  if (start.isAfter(end, 'date')) {
    console.log("Not a valid date range.");
    return null;
  }

  const verifications = await strapi.documents('api::verification.verification').findMany({
    filters: {
      item: {
        documentId: {
          $eq: item.documentId
        }
      },
      date: {
        $between: [start.format("YYYY-MM-DD"), end.format("YYYY-MM-DD")]
      }
    },
    status: 'published'
  });

  return verifications;
}