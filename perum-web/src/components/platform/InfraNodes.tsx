"use client";

import { useEffect, useState } from "react";
import { papi } from "@/lib/platformApi";
import { COUNTRIES, flagEmoji } from "@/lib/countries";
import s from "@/app/platform/infra.module.css";

// ──────────────────────────────────────────────────────────────────────────
// Иконки (инлайн, чтобы не тянуть зависимости)
// ──────────────────────────────────────────────────────────────────────────
const I = {
    Spark: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2dd4a7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12h3l2-7 4 14 3-9 2 2h4" />
        </svg>
    ),
    Globe: () => (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </svg>
    ),
    Copy: () => (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
    ),
    Check: () => (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
        </svg>
    ),
    Chip: () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2dd4a7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 1v4M15 1v4M9 19v4M15 19v4M1 9h4M1 15h4M19 9h4M19 15h4" />
        </svg>
    ),
    Docker: () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#2dd4a7">
            <path d="M13.5 9.5h2.3v2.1h-2.3zM10.8 9.5h2.3v2.1h-2.3zM8.1 9.5h2.3v2.1H8.1zM5.4 9.5h2.3v2.1H5.4zM10.8 7h2.3v2.1h-2.3zM8.1 7h2.3v2.1H8.1zM13.5 7h2.3v2.1h-2.3zM23 10.3c-.6-.4-1.9-.5-2.9-.3-.1-.9-.6-1.7-1.4-2.4l-.5-.4-.4.5c-.5.7-.7 1.8-.6 2.6 0 .3.1.6.3.9-.4.2-1.1.5-2 .5H1.3l-.1.5c-.2 1.5.1 3.1 1 4.4.9 1.4 2.4 2.1 4.3 2.1 4.1 0 7.2-1.9 8.6-5.3 1 0 2.9 0 3.9-1.9l.2-.4-.4-.3z" />
        </svg>
    ),
    Trash: () => (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        </svg>
    ),
    Pencil: () => (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
    ),
    Download: () => (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
        </svg>
    ),
    Drain: () => (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5S5 13 5 15a7 7 0 0 0 7 7z" />
        </svg>
    ),
    X: () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
        </svg>
    ),
};

// ──────────────────────────────────────────────────────────────────────────
// Утилиты
// ──────────────────────────────────────────────────────────────────────────

function CopyBtn({ text, className, okClassName, children }: { text: string; className: string; okClassName?: string; children: (ok: boolean) => React.ReactNode }) {
    const [ok, setOk] = useState(false);
    return (
        <button
            type="button"
            className={`${className} ${ok && okClassName ? okClassName : ""}`}
            onClick={async () => { try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1800); } catch { /* clipboard blocked */ } }}
        >
            {children(ok)}
        </button>
    );
}

// ──────────────────────────────────────────────────────────────────────────
// NodeRow — строка ноды в стиле Remnawave
// ──────────────────────────────────────────────────────────────────────────
export interface NodeUtil { schools_count: number; max_schools: number; capacity_percent: number; ram_used_gb: number | null; cpu_used_percent: number | null; disk_used_gb: number | null; }

const STATUS_META: Record<string, { row: string; pill: string; label: string }> = {
    active: { row: s.rowOnline, pill: s.pillOnline, label: "Онлайн" },
    pending_bootstrap: { row: s.rowPending, pill: s.pillPending, label: "Не установлена" },
    draining: { row: s.rowDrain, pill: s.pillDrain, label: "Вывод" },
    offline: { row: s.rowOffline, pill: s.pillOffline, label: "Оффлайн" },
    decommissioned: { row: s.rowOffline, pill: s.pillDecom, label: "Выведена" },
};

export function NodeRow({ node, util, onInstall, onDrain, onDelete, onEdit }: {
    node: any;
    util?: NodeUtil;
    onInstall: () => void;
    onDrain: () => void;
    onDelete: () => void;
    onEdit: () => void;
}) {
    const meta = STATUS_META[node.status] ?? STATUS_META.offline;
    const heartbeatAlive = node.last_heartbeat && Date.now() - new Date(node.last_heartbeat).getTime() < 300_000;
    const online = node.status === "active" && heartbeatAlive;

    const cpuPct = util?.cpu_used_percent != null && util.cpu_used_percent > 0 ? util.cpu_used_percent : null;
    const diskTotal = node.disk_gb || 1;
    const diskUsed = util?.disk_used_gb != null && util.disk_used_gb > 0 ? util.disk_used_gb : 0;
    const diskPct = diskUsed > 0 ? Math.min(100, (diskUsed / diskTotal) * 100) : 0;
    const schoolsPct = util ? util.capacity_percent : 0;

    const cpuClass = cpuPct == null ? s.cpuPct : cpuPct > 85 ? s.cpuPctCrit : cpuPct > 60 ? s.cpuPctWarn : s.cpuPct;
    const fillClass = schoolsPct > 85 ? s.storageFillCrit : schoolsPct > 60 ? s.storageFillWarn : s.storageFill;

    const uptime = node.last_heartbeat && online ? humanUptime(node.created_at) : null;

    return (
        <div className={`${s.row} ${meta.row}`}>
            {/* identity */}
            <div className={s.ident}>
                <span className={s.sparkBox}><I.Spark /></span>
                <span className={s.allBadge}>ALL {util ? util.schools_count : 0}</span>
                <span className={s.flag}>{flagEmoji(node.country_code)}</span>
                <div className={s.identMain}>
                    <span className={s.name}>{node.name}</span>
                    <span className={s.sub}>
                        {cpuPct != null ? <span className={cpuClass}>{cpuPct.toFixed(0)}%</span> : <span className={s.netRate}>{node.cpu_cores} ядер</span>}
                        <span className={s.netUp}>{node.ram_gb} ГБ</span>
                        <span className={s.netDown}>{node.disk_gb} ГБ</span>
                    </span>
                </div>
                <span className={`${s.statusPill} ${meta.pill}`}>{meta.label}</span>
            </div>

            {/* ip */}
            <div className={s.ipCell}>
                <I.Globe />
                {node.hostname}
            </div>

            {/* storage / schools capacity */}
            <div className={s.storage}>
                <div className={s.storageTop}>
                    <span className={s.storageVal}>{util ? `${util.schools_count} / ${util.max_schools}` : `0 / ${node.max_schools}`} школ</span>
                    <span className={s.storageInf}>{diskUsed > 0 ? `${diskUsed.toFixed(0)} ГБ` : "∞"}</span>
                </div>
                <div className={s.storageTrack}>
                    <div className={fillClass} style={{ width: `${Math.max(schoolsPct, diskPct)}%` }} />
                </div>
            </div>

            {/* right: chips + actions */}
            <div className={s.right}>
                <div className={s.chips}>
                    {uptime && <span className={`${s.chip} ${s.chipUptime}`}><span className={s.chipDot} />{uptime}</span>}
                    {node.agent_version && <span className={s.chip}>v{node.agent_version}</span>}
                    {!online && node.status === "active" && <span className={s.chip}>оффлайн</span>}
                </div>
                <div className={s.actions}>
                    {(node.status === "pending_bootstrap" || node.status === "offline") && (
                        <button className={`${s.actBtn} ${s.actBtnInstall} ${s.actBtnWide}`} onClick={onInstall} title="Скрипт установки">
                            <I.Download /> Скрипт
                        </button>
                    )}
                    {node.status === "active" && (
                        <button className={s.actBtn} onClick={onDrain} title="Вывод из ротации"><I.Drain /></button>
                    )}
                    <button className={s.actBtn} onClick={onEdit} title="Редактировать ноду"><I.Pencil /></button>
                    <button className={`${s.actBtn} ${s.actBtnDanger}`} onClick={onDelete} title="Удалить ноду"><I.Trash /></button>
                </div>
            </div>
        </div>
    );
}

function humanUptime(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    const d = Math.floor(ms / 86_400_000);
    if (d > 0) return `${d}д`;
    const h = Math.floor(ms / 3_600_000);
    if (h > 0) return `${h}ч`;
    return `${Math.max(1, Math.floor(ms / 60_000))}м`;
}

// ──────────────────────────────────────────────────────────────────────────
// CreateNodeWizard — двухшаговый мастер (скриншот "сетап новой ноды")
// ──────────────────────────────────────────────────────────────────────────
export function CreateNodeWizard({ orgs, onClose, onCreated }: {
    orgs: any[] | null;
    onClose: () => void;
    onCreated: () => void;
}) {
    const [step, setStep] = useState<1 | 2>(1);

    const [name, setName] = useState("");
    const [hostname, setHostname] = useState("");
    const [port, setPort] = useState(2222);
    const [country, setCountry] = useState("");
    const [orgId, setOrgId] = useState<string>("");

    const [bootstrap, setBootstrap] = useState<any>(null);
    const [createdId, setCreatedId] = useState<number | null>(null);
    const [busy, setBusy] = useState(false);
    const [downloaded, setDownloaded] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const canProceed = name.trim().length > 0 && hostname.trim().length > 0;

    // Создаёт ноду (если ещё не создана) и тянет bootstrap-скрипт. Кэширует результат.
    // CPU/RAM/диск НЕ задаём — их снимет и пришлёт сам воркер ноды при подключении.
    async function ensureCreated(): Promise<any | null> {
        if (bootstrap && createdId) return bootstrap;
        setBusy(true); setErr(null);
        try {
            const payload: any = {
                name: name.trim(), hostname: hostname.trim(), ssh_port: port,
            };
            if (country) payload.country_code = country;
            if (orgId) payload.org_id = Number(orgId);
            const node = await papi("/api/platform/nodes", { method: "POST", body: JSON.stringify(payload) });
            const bs = await papi(`/api/platform/nodes/${node.id}/bootstrap-script`, { method: "POST" });
            setCreatedId(node.id);
            setBootstrap(bs);
            onCreated();
            return bs;
        } catch (e: any) {
            setErr(e?.message || "Не удалось создать ноду");
            return null;
        } finally {
            setBusy(false);
        }
    }

    // Скачивает bootstrap-скрипт (.sh). Скрипт ставит Docker, поднимает воркера ноды
    // (ROLE=org_agent) с CORE_URL+ENROLLMENT_TOKEN и выполняет enroll-handshake с ядром —
    // т.е. реально настраивает связку «нода ↔ скрипт ↔ ядро».
    async function downloadScript(): Promise<any | null> {
        const bs = await ensureCreated();
        if (!bs) return null;
        const blob = new Blob([bs.content], { type: "application/x-sh" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = bs.filename || `perum-node-${name.trim()}-bootstrap.sh`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setDownloaded(true);
        return bs;
    }

    async function goNext() {
        const bs = await ensureCreated();
        if (bs) setStep(2);
    }

    return (
        <div className={s.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className={`${s.wizard} ${step === 2 ? s.wizardWide : ""}`}>
                <div className={s.wizHead}>
                    <span className={s.wizIcon}><I.Chip /></span>
                    <h2 className={s.wizTitle}>{step === 1 ? "Создать ноду" : "Установка ноды"}</h2>
                    <button className={s.wizClose} onClick={onClose}><I.X /></button>
                </div>

                <div className={s.progress}>
                    <span className={`${s.progSeg} ${s.progSegActive}`} />
                    <span className={`${s.progSeg} ${step >= 2 ? s.progSegActive : ""}`} />
                </div>

                {err && <div className={s.errBox}>{err}</div>}

                {step === 1 ? (
                    <>
                        <p className={s.hint}>
                            Заполните данные ноды и скачайте <span className={s.codeChip}>скрипт установки</span>.
                            Запустите его на сервере под root — он сам поставит Docker, сгенерирует
                            ключи (SECRET_KEY, пароль БД), поднимет воркера и подключит ноду к ядру.
                            Вводить ничего не нужно: токен подключения уже вшит в скрипт. Характеристики
                            сервера (CPU, RAM, диск) воркер определит сам.
                        </p>

                        <div className={s.field}>
                            <label className={s.label}>Внутреннее имя <span className={s.req}>*</span></label>
                            <input className={s.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="напр. US-NY-Node-01" />
                        </div>

                        <div className={s.field}>
                            <label className={s.label}>Страна</label>
                            <select className={s.select} value={country} onChange={(e) => setCountry(e.target.value)}>
                                <option value="">Выберите страну</option>
                                {COUNTRIES.map((c) => (
                                    <option key={c.code} value={c.code}>{flagEmoji(c.code)} {c.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className={s.field}>
                            <label className={s.label}>Организация</label>
                            <select className={s.select} value={orgId} onChange={(e) => setOrgId(e.target.value)}>
                                <option value="">— Общий пул (без организации) —</option>
                                {orgs?.map((o) => (
                                    <option key={o.id} value={o.id}>{o.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className={s.fieldRow}>
                            <div>
                                <label className={s.label}>Домен или IP <span className={s.req}>*</span></label>
                                <span className={s.inputIcon}>
                                    <I.Globe />
                                    <input className={s.input} value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="192.168.1.1" />
                                </span>
                            </div>
                            <div>
                                <label className={s.label}>Node Port <span className={s.req}>*</span></label>
                                <input className={s.input} type="number" value={port} onChange={(e) => setPort(Number(e.target.value) || 2222)} />
                            </div>
                        </div>

                        <button className={`${s.dockerBtn} ${downloaded ? s.dockerBtnOk : ""}`} onClick={downloadScript} disabled={!canProceed || busy}>
                            <I.Download /> {busy ? "Генерация…" : downloaded ? "Скрипт скачан" : "Скачать скрипт установки"}
                        </button>

                        <div className={s.wizFoot}>
                            <button className={s.nextBtn} onClick={goNext} disabled={!canProceed || busy}>
                                {busy ? "…" : "Далее →"}
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <p className={s.hint}>
                            Нода <b style={{ color: "#f4f4f5" }}>{name}</b> зарегистрирована. Скачайте скрипт и запустите его на сервере под root.
                        </p>

                        <button className={`${s.dockerBtn} ${downloaded ? s.dockerBtnOk : ""}`} onClick={downloadScript} disabled={busy}>
                            <I.Download /> {downloaded ? "Скрипт скачан повторно" : "Скачать скрипт установки"}
                        </button>

                        <div className={s.tokenBox}>
                            <div className={s.tokenLabel}>Enrollment Token (действителен 7 дней)</div>
                            <div className={s.tokenVal}>{bootstrap?.enrollment_token}</div>
                        </div>

                        <p className={s.runHint}>
                            На сервере выполните под root: <code>bash {bootstrap?.filename || "perum-node-*.sh"}</code>.
                            Скрипт поставит Docker, поднимет воркера и подключит ноду к ядру. Через 1–2 минуты
                            статус сменится на <b style={{ color: "#2dd4a7" }}>Онлайн</b>, а CPU/RAM/диск подтянутся автоматически.
                        </p>

                        <div className={s.wizFoot}>
                            <button className={s.backBtn} onClick={() => setStep(1)}>← Назад</button>
                            <button className={s.nextBtn} onClick={onClose}>Готово</button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────────
// EditNodeModal — редактирование ноды (имя, страна, адрес, порт, лимит школ, статус)
// ──────────────────────────────────────────────────────────────────────────
export function EditNodeModal({ node, onClose, onSaved }: {
    node: any;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [name, setName] = useState(node.name || "");
    const [country, setCountry] = useState(node.country_code || "");
    const [hostname, setHostname] = useState(node.hostname || "");
    const [port, setPort] = useState(node.ssh_port || 2222);
    const [maxSchools, setMaxSchools] = useState(node.max_schools || 5);
    const [status, setStatus] = useState(node.status || "active");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const STATUSES = [
        { v: "active", l: "Онлайн" },
        { v: "draining", l: "Вывод из ротации" },
        { v: "offline", l: "Оффлайн" },
        { v: "pending_bootstrap", l: "Не установлена" },
        { v: "decommissioned", l: "Выведена" },
    ];

    async function save() {
        setBusy(true); setErr(null);
        try {
            await papi(`/api/platform/nodes/${node.id}`, {
                method: "PATCH",
                body: JSON.stringify({
                    name: name.trim(),
                    hostname: hostname.trim(),
                    ssh_port: port,
                    country_code: country || null,
                    max_schools: maxSchools,
                    status,
                }),
            });
            onSaved();
            onClose();
        } catch (e: any) {
            setErr(e?.message || "Не удалось сохранить");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className={s.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className={s.wizard}>
                <div className={s.wizHead}>
                    <span className={s.wizIcon}><I.Pencil /></span>
                    <h2 className={s.wizTitle}>Редактировать ноду</h2>
                    <button className={s.wizClose} onClick={onClose}><I.X /></button>
                </div>

                {err && <div className={s.errBox}>{err}</div>}

                <div className={s.field}>
                    <label className={s.label}>Внутреннее имя <span className={s.req}>*</span></label>
                    <input className={s.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="US-NY-Node-01" />
                </div>

                <div className={s.field}>
                    <label className={s.label}>Страна</label>
                    <select className={s.select} value={country} onChange={(e) => setCountry(e.target.value)}>
                        <option value="">Не указана</option>
                        {COUNTRIES.map((c) => (
                            <option key={c.code} value={c.code}>{flagEmoji(c.code)} {c.name}</option>
                        ))}
                    </select>
                </div>

                <div className={s.fieldRow}>
                    <div>
                        <label className={s.label}>Домен или IP <span className={s.req}>*</span></label>
                        <span className={s.inputIcon}>
                            <I.Globe />
                            <input className={s.input} value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="192.168.1.1" />
                        </span>
                    </div>
                    <div>
                        <label className={s.label}>Node Port</label>
                        <input className={s.input} type="number" value={port} onChange={(e) => setPort(Number(e.target.value) || 2222)} />
                    </div>
                </div>

                <div className={s.fieldRow}>
                    <div>
                        <label className={s.label}>Макс. школ</label>
                        <input className={s.input} type="number" min={1} value={maxSchools} onChange={(e) => setMaxSchools(Number(e.target.value) || 5)} />
                    </div>
                    <div>
                        <label className={s.label}>Статус</label>
                        <select className={s.select} value={status} onChange={(e) => setStatus(e.target.value)}>
                            {STATUSES.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                        </select>
                    </div>
                </div>

                <p className={s.hint} style={{ marginTop: 4 }}>
                    CPU, RAM и диск задаёт сам воркер ноды при подключении — здесь не редактируются.
                </p>

                <div className={s.wizFoot}>
                    <button className={s.backBtn} onClick={onClose}>Отмена</button>
                    <button className={s.nextBtn} onClick={save} disabled={busy || !name.trim() || !hostname.trim()}>
                        {busy ? "Сохранение…" : "Сохранить"}
                    </button>
                </div>
            </div>
        </div>
    );
}
