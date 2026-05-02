import type { ChannelApiTestCase, ChannelApiTestCategory } from "../../../shared/types";

export const EMPTY_CHANNEL_API_TEST_CASE: ChannelApiTestCase = {
  id: "",
  category: "small",
  label: "暂无题目",
  messages: [],
  rounds: [],
};

export function findChannelApiTestCase(cases: ChannelApiTestCase[], caseId: string) {
  return cases.find((item) => item.id === caseId) ?? cases[0] ?? EMPTY_CHANNEL_API_TEST_CASE;
}

export function getChannelApiTestCasesByCategory(cases: ChannelApiTestCase[], category: ChannelApiTestCategory) {
  return cases.filter((item) => item.category === category);
}

export function getRandomChannelApiTestCase(cases: ChannelApiTestCase[], category: ChannelApiTestCategory) {
  const categoryCases = getChannelApiTestCasesByCategory(cases, category);
  return categoryCases[Math.floor(Math.random() * categoryCases.length)] ?? cases[0] ?? EMPTY_CHANNEL_API_TEST_CASE;
}
