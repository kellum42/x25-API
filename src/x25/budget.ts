import dayjs, { Dayjs } from 'dayjs'

import { x25Item } from '../api/budget/services/budget';
import { getVerificationOn, getVerificationsBetween } from './verifications';

import isBetween from 'dayjs/plugin/isBetween';
import isoWeek from 'dayjs/plugin/isoWeek';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';


// needed to use day.js plugins
dayjs.extend(isBetween);
dayjs.extend(isoWeek);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

type CalculateBalanceAt = "StartofDay" | "EndofDay";
export const calculateBalance = async (startDate: Dayjs, startingAmount: number, items: x25Item[], endDate?: Dayjs, at: CalculateBalanceAt = "StartofDay"): Promise<number | string> => {
  //  If endDate is null, set to today.
  //  If endDate is before startDate, return error
  const _endDate: Dayjs = endDate ?? dayjs();

  if (_endDate.isSameOrBefore(startDate, 'day') && at === "StartofDay") {
    return "End date is before start date. This is illegal.";
    // TODO: - Maybe just return startingAmount here?
  }

  //  Get sumDeltas (sum of expenses/income for line items between start date and end date)
  let sumDeltas = 0;
  let error: string | null;

  //  Loop through line items
  for ( const item of items ){
    if (error) { return; } // if we encounter an error, forgo all calculations.

    if (item.frequency === "Once") {
      if (item.date.isBetween(startDate, endDate, 'day', '[)')) {

        // Check if verified.
        const vAmount = await getVerificationOn(item.date, item, strapi);
        // const vAmount = 0;
        sumDeltas += (vAmount ?? item.amount) * (item.type === "expense" ? -1 : 1);
      }
      return;
    }

    // Incorporate the bounds of the line item into the time range.
    // Ex. - If the time range starts 5/15, but the line item isn't active until 5/25, we must use 5/25.
    // Same for end bounds.
    const localStartDate = item.starts.isAfter(startDate, 'day') ? item.starts : startDate;

    // Makes end date not inclusive --> _endDate.subtract( 1, "day" )
    const localEndDate = item.ends != "-1" && item.ends.isBefore(_endDate, 'day') ? item.ends : _endDate.subtract(at === "EndofDay" ? 0 : 1, "day");

    const spanInDays = localEndDate.diff(localStartDate, "day");

    if (localEndDate.isBefore(localStartDate)) {
      return "Budget line item ends before budget budget start date or line item start date.";
    }

    if (item.frequency == "Weekly" || item.frequency == "Bi-weekly") {
      // calculate the first occurrence of line item.
      const daysUntilFirstOccurrence = daysTillNextOccurrence(item, localStartDate);
      if (typeof daysUntilFirstOccurrence === 'string') { error = daysUntilFirstOccurrence; return; }

      // the days remaining in the time range after the first occurrence.
      const trueSpan: number = spanInDays - daysUntilFirstOccurrence;

      //  If trueSpan < 0, the first occurrence is outside of the given time range.
      //  We can skip it.
      if (trueSpan < 0) { return; }

      //  Divide the trueSpan by 7 (for weekly) or 14 (for biweekly) to see how many occurrences are left in the time range.
      //  Math.floor is used to get rid of any remainder, so we just get the occurrences.
      const numOccurrences: number = Math.floor(trueSpan / (item.frequency == "Weekly" ? 7 : 14)) + 1;

      // Check for verifications.
      const firstOccurrence = localStartDate.add(daysUntilFirstOccurrence, 'day');
      const vers = await getVerificationsBetween([firstOccurrence, localEndDate], item, strapi);

      if (vers && vers.length > 0 && vers.length <= numOccurrences) {
        let verifiedAmount = 0;
        vers.forEach((v) => { verifiedAmount += v.amount });
        sumDeltas += verifiedAmount * (item.type === "expense" ? -1 : 1);
        sumDeltas += (numOccurrences - vers.length) * item.amount * (item.type === "expense" ? -1 : 1)
      } else {
        sumDeltas += numOccurrences * item.amount * (item.type === "expense" ? -1 : 1);
      }

    } else if (item.frequency == "Monthly") {
      let i = -1;
      for (const _ of item.dates){
        i++;
        // calculate the first occurrence of line item.
        // this will be our frame of reference for calculating future occurrences.
        //  i is needed to tell daysTillNextOccurrence which MonthlyBudgetItem.dates[] we're using.
        const daysUntilFirstOccurrence = daysTillNextOccurrence(item, localStartDate, i);
        if (typeof daysUntilFirstOccurrence === 'string') { error = daysUntilFirstOccurrence; return; }

        const firstOccurrence = localStartDate.add(daysUntilFirstOccurrence, 'day');

        if (firstOccurrence.isAfter(localEndDate, 'date')) {
          return;
        }

        const fullMonthsRemaining: number = localEndDate.diff(firstOccurrence, 'month');

        // Check for verifications.
        const vers = await getVerificationsBetween([firstOccurrence, localEndDate], item, strapi);

        //  Based on the date of the first occurrence, calculate the remaining occurrences in the time range.
        //  Occurrences will be equal to the number of remaining full months in time range.
        //  1 is added to fullMonthsRemaining to account for the first occurrence.
        //  1 is added to fullMonthsRemaining to account for the first occurrence.
        const numOccurrences = fullMonthsRemaining + 1;

        if (vers && vers.length > 0 && vers.length <= numOccurrences) {
          let verifiedAmount = 0;
          vers.forEach((v) => { verifiedAmount += v.amount });
          sumDeltas += verifiedAmount * (item.type === "expense" ? -1 : 1);
          sumDeltas += (numOccurrences - vers.length) * item.amount * (item.type === "expense" ? -1 : 1)
          
        } else {
          sumDeltas += numOccurrences * item.amount * (item.type === "expense" ? -1 : 1);
        }
      };
    }
  }

  // converts to two decimal places.
  return Math.round((sumDeltas + startingAmount) * 100) / 100;
}

export const daysTillNextOccurrence = (item: x25Item, _from: Dayjs, i?: number): number | string => {
  const from = _from.set('hour', 0).set('minutes', 0).set('seconds', 0);

  if (item.frequency == "Weekly" || item.frequency == "Bi-weekly") {

    const getDayAsInt = (day: string): number => {
      if (day === "Sunday") { return 0; }
      if (day === "Monday") { return 1; }
      if (day === "Tuesday") { return 2; }
      if (day === "Wednesday") { return 3; }
      if (day === "Thursday") { return 4; }
      if (day === "Friday") { return 5; }
      else { return 6; }
    }

    // Take into account item start and end dates.
    if (item.ends !== "-1" && item.ends.isBefore(from)) { return -1; }

    const starts = item.starts.set('hour', 0).set('minutes', 0).set('seconds', 0);
    let delta = 0;

    if (from.isBefore(starts, 'day')) {
      delta = (starts.unix() - from.unix()) / (3600 * 24);
      delta = Math.round(delta);
    }

    // start of calculation time range.
    const startDay = (delta > 0 ? starts : from).day();
    const firstOccurrence = getDayAsInt(item.day);

    const isBiWeekly = item.frequency === "Bi-weekly";
    const occursThisWeek = (from.isoWeek() - starts.isoWeek()) % 2 === 0 // for biweekly line items

    // is upcoming this week
    if (firstOccurrence >= startDay) {
      const days = firstOccurrence - startDay + delta + ((isBiWeekly && !occursThisWeek) ? 7 : 0);
      // console.log("%s -- day: %s, start: %d, first occurrence: %d, delta: %d, from: %s, isBiweekly: %s. days: %d", item.name, item.day, startDay, firstOccurrence, delta, from.format("YYYY-MM-DD"), isBiWeekly, days);
      return days;
    } else {
      // occurrence has already passed this week.
      // Add the remaining days of the current week to the day of the week of the first occurrence.
      // If biweekly, it has already occurred this week. It won't occur again next week, so a 7 day offset is needed.
      const days = (7 - startDay) + firstOccurrence + delta + (isBiWeekly && occursThisWeek ? 7 : 0);
      return days;
    }

  } else if (item.frequency == "Monthly") {
    const _i = i ?? -1;
    if (_i >= 0 && _i <= item.dates.length) {
      const fromDate = from.date();
      const occurrenceDate = parseInt(item.dates[_i]);

      // Take into account item start and end dates.
      if (item.ends !== "-1" && item.ends.isBefore(from)) { return -1; }

      // Sum days between from date and when the item starts.
      if (from.isBefore(item.starts, 'day')) {
        let firstOccurrence = item.starts
          .set('date', occurrenceDate)
          .set('hour', 0)
          .set('minutes', 0)
          .set('seconds', 0)
          .add(occurrenceDate < item.starts.date() ? 1 : 0, 'month');

        const diff = Math.round((firstOccurrence.unix() - from.unix()) / (3600 * 24));
        // console.log("%s -- first occurrence: %s, from: %s, days: %d", item.name, firstOccurrence.format("YYYY-MM-DD HH:mm:ss"), _from.format("YYYY-MM-DD HH:mm:ss"), diff)
        return diff;

      } else {
        if (occurrenceDate >= fromDate) {
          return occurrenceDate - fromDate;

        } else {
          // Get the rest of the days to finish out the month.
          // Add those days to the date of the occurrence.
          return _from.daysInMonth() - fromDate + occurrenceDate;
        }
      }

    } else {
      return "A valid iterator is required for MonthlyBudgetItems.";
    }

  } else if (item.frequency === "Once") {
    // return "Offset can only be calculated for reoccurring BudgetItems.";
    // return item.date.diff( from, 'day' );
    return Math.round((item.date.unix() - from.unix()) / (3600 * 24));
    // delta = Math.round(delta);
  }
  // Should never get here.
  return "";
}