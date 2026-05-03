import { useCallback, useEffect, useMemo, useState } from "react";

import { channelApiTestApi } from "../../../shared/services/api";
import type {
  ChannelApiTestCategory,
  ChannelApiTestCase,
  ChannelApiTestCaseUpsertInput,
  ChannelApiTestProtocol,
  ChannelApiTestRunInput,
  ChannelApiTestRunItem,
} from "../../../shared/types";
import {
  findChannelApiTestCase,
  getChannelApiTestCasesByCategory,
  getRandomChannelApiTestCase,
} from "../data/testCases";

type FormState = {
  protocol: ChannelApiTestProtocol;
  model: string;
  baseUrl: string;
  apiKey: string;
  stream: boolean;
  category: ChannelApiTestCategory;
  caseMode: "specific" | "random";
  caseId: string;
};

export function useChannelApiTestController() {
  const [form, setForm] = useState<FormState>({
    protocol: "openai",
    model: "",
    baseUrl: "",
    apiKey: "",
    stream: true,
    category: "small",
    caseMode: "specific",
    caseId: "",
  });
  const [items, setItems] = useState<ChannelApiTestRunItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [cases, setCases] = useState<ChannelApiTestCase[]>([]);
  const [casesLoading, setCasesLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categoryCases = useMemo(() => getChannelApiTestCasesByCategory(cases, form.category), [cases, form.category]);
  const selectedCase = useMemo(() => findChannelApiTestCase(cases, form.caseId), [cases, form.caseId]);

  const updateForm = useCallback((patch: Partial<FormState>) => {
    setForm((current) => {
      if (patch.category && patch.category !== current.category) {
        const nextCases = getChannelApiTestCasesByCategory(cases, patch.category);
        return {
          ...current,
          ...patch,
          caseId: nextCases[0]?.id ?? current.caseId,
        };
      }
      return { ...current, ...patch };
    });
  }, [cases]);

  const loadCases = useCallback(async () => {
    setCasesLoading(true);
    setError(null);
    try {
      const result = await channelApiTestApi.listCases({} as never);
      setCases(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载题库失败");
    } finally {
      setCasesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCases();
  }, [loadCases]);

  useEffect(() => {
    if (categoryCases.length > 0 && !categoryCases.some((item) => item.id === form.caseId)) {
      setForm((current) => ({ ...current, caseId: categoryCases[0].id }));
    }
  }, [categoryCases, form.caseId]);

  const loadRuns = useCallback(
    async (nextPage: number, nextPageSize: number) => {
      setLoading(true);
      setError(null);
      try {
        const result = await channelApiTestApi.queryRuns({
          page: nextPage,
          pageSize: nextPageSize,
        } as never);
        setItems(result.items);
        setTotal(result.total);
        setPage(result.page);
        setPageSize(result.pageSize);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载测试记录失败");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadRuns(1, pageSize);
  }, [loadRuns, pageSize]);

  const canRun =
    form.model.trim() !== "" &&
    form.baseUrl.trim() !== "" &&
    form.apiKey.trim() !== "" &&
    selectedCase.id !== "";

  const run = useCallback(async () => {
    if (!canRun) {
      return;
    }
    const testCase = form.caseMode === "random" ? getRandomChannelApiTestCase(cases, form.category) : findChannelApiTestCase(cases, form.caseId);
    const input: ChannelApiTestRunInput = {
      protocol: form.protocol,
      model: form.model.trim(),
      baseUrl: form.baseUrl.trim(),
      apiKey: form.apiKey,
      stream: form.stream,
      category: testCase.category,
      caseId: testCase.id,
      runMode: "standard",
      messages: testCase.messages,
      rounds: testCase.rounds,
    };
    setRunning(true);
    setError(null);
    void channelApiTestApi
      .run(input)
      .then(() => loadRuns(1, pageSize))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "运行渠道测试失败");
      })
      .finally(() => {
        setRunning(false);
      });
  }, [canRun, cases, form, loadRuns, pageSize]);

  const runWithMode = useCallback(
    async (runMode: "diagnostic" | "sampling") => {
      if (!canRun) {
        return;
      }
      const testCase = form.caseMode === "random" ? getRandomChannelApiTestCase(cases, form.category) : findChannelApiTestCase(cases, form.caseId);
      const input = {
        protocol: form.protocol,
        model: form.model.trim(),
        baseUrl: form.baseUrl.trim(),
        apiKey: form.apiKey,
        stream: form.stream,
        category: testCase.category,
        caseId: testCase.id,
        runMode,
        messages: testCase.messages,
        rounds: testCase.rounds,
      };
      setRunning(true);
      setError(null);
      void channelApiTestApi
        .run(input)
        .then(() => loadRuns(1, pageSize))
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : "运行渠道诊断失败");
        })
        .finally(() => {
          setRunning(false);
        });
    },
    [canRun, cases, form, loadRuns, pageSize],
  );

  const runDiagnostic = useCallback(async () => {
    await runWithMode("diagnostic");
  }, [runWithMode]);

  const runSampling = useCallback(async () => {
    await runWithMode("sampling");
  }, [runWithMode]);

  const saveCase = useCallback(
    async (input: Omit<ChannelApiTestCaseUpsertInput, "workspaceId">) => {
      setError(null);
      const saved = await channelApiTestApi.upsertCase(input as never);
      await loadCases();
      setForm((current) => ({
        ...current,
        category: saved.category,
        caseId: saved.id,
        caseMode: "specific",
      }));
    },
    [loadCases],
  );

  const deleteCase = useCallback(
    async (caseId: string) => {
      setError(null);
      await channelApiTestApi.deleteCase({ caseId } as never);
      await loadCases();
    },
    [loadCases],
  );

  return {
    form,
    updateForm,
    cases,
    categoryCases,
    selectedCase,
    items,
    total,
    page,
    pageSize,
    loading,
    casesLoading,
    running,
    error,
    canRun,
    run,
    runDiagnostic,
    runSampling,
    loadRuns,
    loadCases,
    saveCase,
    deleteCase,
  };
}
