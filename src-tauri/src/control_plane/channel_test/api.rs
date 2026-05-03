use super::*;

#[tauri::command]
pub fn channel_test_query_runs(
    state: State<'_, AppState>,
    input: ChannelApiTestRunsQueryInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    persistence::get_workspace(&conn, crate::domain::models::APP_SCOPE_ID)?;
    query::query_runs(
        &conn,
        crate::domain::models::APP_SCOPE_ID,
        input.page,
        input.page_size,
    )
}

#[tauri::command]
pub fn channel_test_cases_list(
    state: State<'_, AppState>,
    input: ChannelApiTestCasesQueryInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    persistence::get_workspace(&conn, crate::domain::models::APP_SCOPE_ID)?;
    persistence::seed_default_cases_once(&conn, crate::domain::models::APP_SCOPE_ID)?;
    persistence::query_custom_cases(&conn, crate::domain::models::APP_SCOPE_ID)
}

#[tauri::command]
pub fn channel_test_case_upsert(
    state: State<'_, AppState>,
    input: ChannelApiTestCaseUpsertInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    persistence::get_workspace(&conn, crate::domain::models::APP_SCOPE_ID)?;
    validation::validate_case_input(&input)?;
    persistence::upsert_custom_case(&conn, &input)
}

#[tauri::command]
pub fn channel_test_case_delete(
    state: State<'_, AppState>,
    input: ChannelApiTestCaseDeleteInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    persistence::get_workspace(&conn, crate::domain::models::APP_SCOPE_ID)?;
    if input.case_id.trim().is_empty() {
        return Err(AppError::invalid_argument("题目 ID 不能为空"));
    }
    persistence::delete_custom_case(&conn, crate::domain::models::APP_SCOPE_ID, &input.case_id)
}

#[tauri::command]
pub async fn channel_test_run(
    state: State<'_, AppState>,
    input: ChannelApiTestRunInput,
) -> Result<Value, AppError> {
    let app_state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || run_and_persist(app_state, input))
        .await
        .map_err(|err| AppError::internal(format!("渠道测试任务异常退出: {err}")))?
}

fn run_and_persist(state: AppState, input: ChannelApiTestRunInput) -> Result<Value, AppError> {
    runner::run_and_persist(state, input)
}
