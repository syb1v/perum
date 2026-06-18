/* ===== TypeScript types for ПЭРУМ ===== */

export type UserRole = 'student' | 'teacher' | 'class_teacher' | 'admin' | 'homeroom_teacher' | 'school_admin' | 'org_admin' | 'director' | 'parent';

// ==========================================
// Админ-панель
// ==========================================

export interface ChartPoint {
    date: string;
    views: number;
    uniques: number;
}

export interface TrafficSource {
    source: string;
    visits: number;
}

export interface DeviceStats {
    device: string;
    visits: number;
}

export interface PopularSection {
    section: string;
    clicks: number;
}

export interface EconomySource {
    source: string;
    amount: number;
}

export interface DashboardStatsResponse {
    success: boolean;
    views_today: number;
    unique_today: number;
    views_period: number;
    unique_period: number;
    avg_time_seconds: number;
    mobile_percentage: number;

    grades_given_period: number;

    chart_data: ChartPoint[];
    traffic_sources: TrafficSource[];
    devices: DeviceStats[];
    popular_sections: PopularSection[];
}

export interface EconomyDailyPoint {
    date: string;
    income: number;
    expense: number;
}

export interface TransactionDetail {
    id: number;
    user_login: string;
    user_name: string;
    amount: number;
    type: string;
    description: string;
    created_at: string;
}

export interface ClassEconomy {
    class_id: number | null;
    class_name: string;
    income: number;
    expense: number;
}

export interface MarketCategoryEconomy {
    category: string;
    amount: number;
}

export interface MarketItemEconomy {
    item_id: number | null;
    item_name: string;
    amount: number;
}

export interface DeepEconomyResponse {
    success: boolean;
    total_distributed: number;
    total_spent: number;
    daily_stats: EconomyDailyPoint[];
    income_sources: EconomySource[];
    expense_sources: EconomySource[];
    recent_large_transactions: TransactionDetail[];
    class_stats: ClassEconomy[];
    market_categories: MarketCategoryEconomy[];
    market_items: MarketItemEconomy[];
}

export interface PerformanceDailyPoint {
    date: string;
    avg_grade: number;
}

export interface GradeDistribution {
    grade_value: number;
    count: number;
}

export interface SubjectPerformance {
    subject_name: string;
    avg_grade: number;
}

export interface PerformanceResponse {
    success: boolean;
    average_school_grade: number;
    total_grades_given: number;
    daily_stats: PerformanceDailyPoint[];
    grade_distribution: GradeDistribution[];
    top_subjects: SubjectPerformance[];
    bottom_subjects: SubjectPerformance[];
}

export interface User {
    id: number;
    login: string;
    first_name: string | null;
    last_name: string | null;
    patronymic: string | null;
    email: string | null;
    phone: string | null;
    balance: number;
    role: UserRole;
    avatar_url: string | null;
    password_changed: boolean;
    created_at: string | null;
    last_login: string | null;
    last_transaction: Transaction | null;
}

export interface Transaction {
    id: number;
    amount: number;
    balance_after: number;
    type: string;
    reason: string | null;
    description?: string;
    created_at: string;
}

export interface TransactionsResponse {
    transactions: Transaction[];
    total?: number;
    balance: number;
    page?: number;
    pages?: number;
}

export interface Notification {
    id: number;
    title: string;
    text: string;
    type: string;
    is_read: boolean;
    created_at: string;
}

export interface LoginRequest {
    login: string;
    password: string;
    remember_me?: boolean;
}

export interface LoginResponse {
    success: boolean;
    token: string;
    session_token: string | null;
    user: {
        id: number;
        login: string;
        first_name: string | null;
        last_name: string | null;
        patronymic: string | null;
        balance: number;
        role: UserRole;
        password_changed: boolean;
    };
}

/* Quest types */
export interface Quest {
    id: number | null; // UserQuest ID
    quest_id: number;
    title: string;
    description: string;
    reward: number;
    type: string;
    progress: number;
    target: number;
    status: 'active' | 'available' | 'completed' | 'ready';
    reward_claimed: boolean;
}

/* News types */
export interface NewsItem {
    id: number;
    title: string;
    content: string;
    author_name: string | null;
    media?: string | null;
    is_published?: number | boolean;
    created_at: string | null;
    likes_count?: number;
    views_count?: number;
    is_liked?: boolean;
    is_read?: boolean;
}

/* Leaderboard types */
export interface LeaderboardEntry {
    rank: number;
    student: {
        id: number;
        first_name: string | null;
        last_name: string | null;
        login: string;
        class_name: string | null;
        avatar_url?: string | null;
    };
    avg: number;
    grades_count: number;
    positive_count: number;
    badge?: string | null;
    is_current_user: boolean;
}

export interface LeaderboardResponse {
    subject: {
        id: number;
        name: string;
    };
    leaderboard: LeaderboardEntry[];
    current_user_entry: LeaderboardEntry | null;
    season: string;
    scope: string;
    forming?: boolean;
    forming_message?: string;
}

/* Schedule types */
export interface ScheduleLesson {
    order: number;
    subject_name: string;
    teacher_name: string;
    classroom: string | null;
    grade?: number | null;
    homework?: string | null;
    homework_status?: string | null;
}

export interface ScheduleDay {
    day_name: string;
    date: string;
    is_today: boolean;
    lessons: ScheduleLesson[];
}

/* Subject types */
export type SubjectCategory = 'profile' | 'normal' | 'minor';

export interface Subject {
    id: number;
    name: string;
    short_name?: string | null;
    category?: SubjectCategory;
    profile_weight?: number;
    is_profile_track?: boolean;
    in_exchange?: boolean;
    exchange_coefficient?: number;
}

/* Grade and Topic types */
export interface Topic {
    id: number;
    name: string;
    subject_id: number;
}

export interface Grade {
    id: number;
    value: number;
    subject_name: string;
    subject_id: number;
    type: string;
    comment: string | null;
    teacher_name: string;
    created_at: string;
    points_earned: number;
    lesson_date?: string;
    color?: string;
    grade_type?: string;
    work_type_id?: number | null;
    weight?: number | null;
    grade_value?: number; // sometimes API returns this
    student?: {
        id: number;
        first_name: string;
        last_name: string;
    };
    subject?: {
        id: number;
        name: string;
    };
    points?: number; // alias for points_earned
    attendance_mark?: string | null; // "УП", "НП", "осв."
}

export interface WorkType {
    id: number;
    name: string;
    weight: number;
    is_active: boolean;
}

export interface GradesSummary {
    subjects: Array<{
        subject_id: number;
        subject_name: string;
        average: number;
        count: number;
        points: number;
    }>;
    total_points: number;
    total_grades: number;
}

/* Diary types (for schedule page) */
export interface DiaryGrade {
    value: number;
    type: string;
    color: string;
    points?: number;
    weight?: number;
}

export interface DiaryHomework {
    id: number;
    title: string;
    description?: string;
    due_date?: string;
    completed?: boolean;
    attachments?: {
        id: number;
        filename?: string;
        url_link?: string;
    }[];
}

export interface DiaryLesson {
    lesson_number: number;
    subject_id: number;
    subject_name: string;
    teacher_name: string | null;
    start_time: string;
    end_time: string;
    room: string | null;
    group_name?: string;
    grades: DiaryGrade[];
    homework: DiaryHomework[];
    control_work?: { id: number; work_type: string; title: string | null; } | null;
}

export interface DiaryDay {
    lessons: DiaryLesson[];
}

export interface DiaryResponse {
    class_id: number | null;
    class_name: string | null;
    week_start: string;
    week_end: string;
    week_offset: number;
    current_period?: PeriodInfo | null;
    week_periods?: PeriodInfo[];
    diary: {
        [day: string]: DiaryDay;
    };
}

export interface GradesResponse {
    grades: Array<{
        id: number;
        date: string;
        subject_name: string;
        subject_id: number;
        type: string;
        value: number;
        color: string;
        points: number;
        weight?: number;
    }>;
}

export interface Work {
    id: number;
    title: string;
    description?: string;
    subject: string;
    due_date?: string;
    status: 'pending' | 'completed' | 'overdue';
}

/* Exchange types */
export interface ExchangeSubject {
    id: number;
    name: string;
    current_index: number;
    change_percent: number;
    trend: 'up' | 'down' | 'stable';
    icon?: string;
    average_score?: number; // From API
    index_change?: number; // From API
    subject?: { id: number; name: string; category?: string }; // Nested in API
}

export interface Investment {
    id: number;
    subject_id?: number;
    subject_name?: string;
    subject?: { id: number; name: string };
    amount: number;
    invested_at?: string;
    created_at?: string;
    current_value?: number;
    profit?: number;
    week_number?: number;
    status?: string;
    result_amount?: number;
    index_change?: number;
    completed_at?: string;
}

export interface TradingWindow {
    id: number;
    is_active: boolean;
    opens_at: string;
    closes_at: string;
}

export interface MarketData {
    subject_averages: ExchangeSubject[];
    available_subjects: Array<{ id: number; name: string; category: string }>;
    current_week: number;
    academic_year: number;
    trading_window: TradingWindow;
}

export interface ExchangeStats {
    total_volume: number;
    active_investors: number;
    best_performing_subject: { id: number; name: string } | null;
    worst_performing_subject: { id: number; name: string } | null;
    average_index_change: number;
}

export interface ExchangePortfolio {
    user_id: number;
    total_points: number;
    invested_amount: number;
    active_investments: Investment[];
    completed_investments: Investment[];
    total_profit_loss: number;
}

/* Market types */
export interface ShopItem {
    id: number;
    name: string;
    description: string;
    item_type: 'avatar' | 'background' | 'gift' | 'stationery';
    rarity: 'common' | 'rare' | 'super_rare' | 'legendary';
    price: number;
    image_path: string | null;
    is_active: boolean;
    stock: number | null;
    per_user_limit: number | null;
    // Улучшения
    is_upgradable?: boolean;
    upgrade_price?: number | null;
    // Отложенная публикация
    available_from?: string | null;
}

export interface InventoryItem {
    id: number;
    item: ShopItem;
    is_equipped: boolean;
    purchased_at: string | null;
    is_issued?: boolean;
    issued_at?: string | null;
    // Улучшения подарка (многослойность)
    upgrade_bg_url?: string | null;
    upgrade_pattern_url?: string | null;
    upgrade_pattern_mode?: 'cover' | 'repeat' | 'contain' | string | null;
    upgrade_skin?: string | null;
}

export interface GiftUpgradeAsset {
    id: number;
    asset_type: 'background' | 'pattern';
    name: string;
    url: string;
    render_mode?: 'cover' | 'repeat' | 'contain' | string;
    is_active: boolean;
    available_from: string | null;
    school_id: number | null;
    created_at: string | null;
}

/* Teacher types */
export interface ClassInfo {
    id: number;
    name: string;
    student_count: number;
    grade_level: number;
    parent_id?: number | null;
}

export interface TeacherSubjectAssignment {
    id: number;
    subject_name: string;
    class_name: string;
}

/* Journal types */
export interface AcademicYear {
    id: number;
    name: string;
    start_date: string;
    end_date: string;
    is_current: boolean;
}

export interface FinalGrade {
    id: number;
    student_id: number;
    subject_id: number;
    period_id: number | null;
    grade_value: number;
    grade_type: string;
    comment: string | null;
    color?: string;
}

export interface ControlWork {
    id: number;
    class_id: number;
    class_name?: string | null;
    subject_id: number;
    subject_name?: string | null;
    work_type: string;
    title: string | null;
    work_date: string;
}

export interface JournalStudent {
    id: number;
    first_name: string;
    last_name: string;
    average: number;
    grades: Grade[];
}

export interface PeriodInfo {
    id: number;
    name: string;
    period_type: string;
    target_grades?: string | null;
    academic_year_id?: number | null;
    start_date: string;
    end_date: string;
}

export interface HolidayPeriod {
    name: string;
    start_date: string;
    end_date: string;
}

export interface JournalData {
    students: JournalStudent[];
    dates?: string[];
    subject: Subject;
    class_name: string;
    current_period?: PeriodInfo | null;
    available_periods?: PeriodInfo[];
    final_grades?: FinalGrade[];
    control_works?: ControlWork[];
    can_set_final_grade?: boolean;
    holiday_periods?: HolidayPeriod[];
    readonly?: boolean;
    subgroup_name?: string | null;
}

/* Analytics types */
export interface KPIStats {
    avg_grade: number;
    total_grades: number;
    bad_grades: number;
    bad_ratio: string;
    problem_topics_count: number;
}

export interface DynamicsPoint {
    date: string;
    avg: number;
}

export interface ProblemTopic {
    id?: number;
    name: string;
    avg: number;
    bad_ratio: string;
}

export interface AttentionStudent {
    id: number;
    name: string;
    avg: number;
    twos: number;
}

export interface AnalyticsDashboardResponse {
    kpi: KPIStats;
    dynamics: DynamicsPoint[];
    problem_topics: ProblemTopic[];
    attention_students: AttentionStudent[];
}

export interface WorkAnalysis {
    id: number;
    date: string;
    type: string;
    topic: string | null;
    avg: number;
    bad_ratio: string;
}

export interface AnalyticsWorksResponse {
    works: WorkAnalysis[];
    students?: { id: number; name: string; avg: number }[]; // Problem students
}

export interface TopicStats {
    id?: number;
    name: string;
    avg: number;
    bad_ratio: string;
}

export interface AnalyticsTopicsResponse {
    class_avg: number;
    topics: TopicStats[];
}


/* Admin types */
export interface AdminUser {
    id: number;
    login: string;
    first_name: string | null;
    last_name: string | null;
    patronymic: string | null;
    role: UserRole;
    balance: number;
    created_at: string;
    last_login: string | null;
}

/* Bell Schedule types */
export interface BellScheduleItem {
    lesson_number: number;
    start_time: string;
    end_time: string;
    is_saturday?: boolean;
}

export interface BellSchedule {
    id: number;
    name: string;
    classes_count: number;
    items: BellScheduleItem[];
}

/* Contact form */
export interface ContactFormData {
    org_name: string;
    email: string;
    message: string;
}

/* API response wrappers */
export interface ApiSuccess {
    success: boolean;
    message?: string;
}

export interface ApiError {
    detail: string;
}

/* ==========================================
 * Infrastructure types (nodes, capacity, updates)
 * ========================================== */

export type NodeStatus = 'pending_bootstrap' | 'active' | 'draining' | 'offline' | 'decommissioned';

export interface Node {
    id: number;
    name: string;
    hostname: string;
    ssh_port: number;
    cpu_cores: number;
    ram_gb: number;
    disk_gb: number;
    status: NodeStatus;
    org_id: number | null;
    agent_version: string | null;
    last_heartbeat: string | null;
    max_schools: number;
    created_at: string;
    updated_at: string;
}

export interface NodeListResponse {
    nodes: Node[];
    total: number;
}

export interface NodeUtilization {
    node_id: number;
    schools_count: number;
    max_schools: number;
    capacity_percent: number;
    ram_used_gb: number | null;
    cpu_used_percent: number | null;
    disk_used_gb: number | null;
}

export interface NodeConfig {
    cpu_cores: number;
    ram_gb: number;
    disk_gb: number;
    schools_per_node: number;
    nodes_needed: number;
}

export interface CapacityRecommendation {
    recommendations: NodeConfig[];
    total_schools: number;
    summary: string;
}

export interface BootstrapScript {
    filename: string;
    content: string;
    instructions: string;
}

export interface UpdateHistoryEntry {
    id: number;
    school_id: number;
    from_version: string | null;
    to_version: string;
    status: 'pending' | 'success' | 'failed' | 'rolled_back';
    started_at: string;
    completed_at: string | null;
    error_message: string | null;
}

export interface UpdateHistoryResponse {
    school_id: number;
    school_slug: string;
    history: UpdateHistoryEntry[];
    total: number;
}

export interface CurrentRelease {
    version_tag: string;
    image: string | null;
    changelog: string | null;
    source_commit: string | null;
    published_at: string | null;
}

export interface AvailableUpdates {
    available: boolean;
    current_version: string | null;
    updatable_schools: Array<{
        school_id: number;
        school_slug: string;
        current_version: string | null;
        available_version: string;
    }>;
    total_updatable: number;
}

export interface OrgLimits {
    schools: {
        used: number;
        limit: number;
        plan_limit: number;
        org_limit: number;
        exceeded: boolean;
    };
    nodes: {
        used: number;
        limit: number;
        exceeded: boolean;
    };
    custom_domains: {
        used: number;
        limit: number;
        exceeded: boolean;
    };
    custom_landing: {
        enabled: boolean;
    };
    plan_tier: string;
}

export interface NodeSchool {
    school_id: number;
    school_slug: string;
    school_name: string;
    status: string;
    assigned_at: string;
}
