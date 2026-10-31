/* SPDX-License-Identifier: GPL-3.0-or-later */
import pluginStyle from "./style.css?managed";
import { definePluginSettings } from "@api/Settings";
import { disableStyle, enableStyle } from "@api/Styles";
import { Button } from "@components/Button";
import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import definePlugin, { OptionType } from "@utils/types";
import { ChannelStore, FluxDispatcher, Menu, Modal, React, RestAPI, Select, SelectedChannelStore, UserStore, closeModal, openModal } from "@webpack/common";
import { Conversation, Job, Message, Progress, Range, ScanResult, Transport, validId } from "./core";
import { captureTheme, renderExport } from "./export";

let enabled = false, active: Job | undefined, modalKey: string | undefined;
const settings = definePluginSettings({ manager: { type: OptionType.COMPONENT, component: () => <div>
    <Paragraph>Export conversations using your current theme, or preview and delete your own messages.</Paragraph>
    <Button onClick={() => openManager()}>Open DMsManager</Button>
</div> } });
function checked(response: any) {
    if (response?.ok === false || response?.status >= 400)
        throw Object.assign(Error(response?.body?.message ?? `Discord returned ${response.status}.`), { status: response.status, body: response.body });
    return response;
}
const api: Transport = {
    owner: () => UserStore.getCurrentUser()?.id,
    privateChannel: id => { const channel = ChannelStore.getChannel(id); return !!channel && (channel.type === 1 || channel.type === 3); },
    page: async (id, before) => checked(await RestAPI.get({ url: `/channels/${id}/messages`, query: { limit: 100, before }, retries: 0 })).body,
    message: async (id, message) => checked(await RestAPI.get({ url: `/channels/${id}/messages/${message}`, retries: 0 })).body,
    remove: async (id, message) => {
        checked(await RestAPI.del({ url: `/channels/${id}/messages/${message}`, retries: 0 }));
        FluxDispatcher.dispatch({ type: "MESSAGE_DELETE", channelId: id, id: message });
    }
};
function conversations(): Conversation[] {
    return ChannelStore.getSortedPrivateChannels().filter(c => c.type === 1 || c.type === 3).map(channel => ({ id: channel.id,
        name: channel.name || channel.recipients.map(id => { const user = UserStore.getUser(id); return user?.globalName || user?.username || id; }).join(", ") || "Unknown conversation" }));
}
function enrich(message: Message): Message {
    const enrichAuthor = (author: Message["author"]) => {
        const cached = UserStore.getUser(author.id);
        const guild = cached?.primaryGuild;
        return { ...author, ...(!Object.hasOwn(author, "primary_guild") && guild ? { primary_guild: {
            identity_guild_id: guild.identityGuildId, identity_enabled: guild.identityEnabled, tag: guild.tag, badge: guild.badge
        } } : {}) };
    };
    return { ...message, author: enrichAuthor(message.author), referenced_message: message.referenced_message ? {
        ...message.referenced_message, author: message.referenced_message.author ? enrichAuthor(message.referenced_message.author) : undefined
    } : undefined };
}
function download(name: string, content: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement("a"); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function accountChanged() { if (active && api.owner() !== active.owner) active.cancel("Account changed. The job was stopped."); }
function openManager(initial?: string) {
    if (!enabled) return;
    modalKey = openModal(props => <Manager {...props} initial={initial} />, { modalKey: "dms-manager", onCloseCallback: () => { active?.cancel("Manager closed. No more requests will be sent."); modalKey = undefined; } });
}
function Manager({ initial, onClose, transitionState }: { initial?: string; onClose(): void; transitionState: number; }) {
    const owner = api.owner();
    const [channels, setChannels] = React.useState(conversations);
    const initialId = initial ?? SelectedChannelStore.getChannelId();
    const [selected, setSelected] = React.useState<Set<string>>(() => new Set(channels.some(c => c.id === initialId) ? [initialId] : []));
    const [search, setSearch] = React.useState("");
    const [after, setAfter] = React.useState(""), [before, setBefore] = React.useState("");
    const [format, setFormat] = React.useState("html"), [delay, setDelay] = React.useState(1500);
    const [busy, setBusy] = React.useState(false), [plan, setPlan] = React.useState<ScanResult>();
    const [confirmation, setConfirmation] = React.useState("");
    const [status, setStatus] = React.useState("Select DMs and choose an action.");
    const [progress, setProgress] = React.useState<Progress>();
    const [account, setAccount] = React.useState(owner);
    const mounted = React.useRef(true);
    const lastAccount = React.useRef(owner);
    React.useEffect(() => {
        mounted.current = true;
        const changed = () => {
            const next = api.owner(); if (next === lastAccount.current) return;
            lastAccount.current = next; setAccount(next); setPlan(undefined); setConfirmation(""); setSelected(new Set()); setChannels(conversations());
        };
        UserStore.addChangeListener(changed);
        return () => { mounted.current = false; active?.cancel("Manager closed."); UserStore.removeChangeListener(changed); };
    }, []);
    const close = () => { active?.cancel("Manager closed."); onClose(); };
    const invalidate = () => { setPlan(undefined); setConfirmation(""); };
    function range(): Range {
        const from = after ? Date.parse(after) : undefined;
        const until = before ? Date.parse(before) + 86400000 : Date.now();
        if (from !== undefined && (!Number.isFinite(from) || from >= until) || !Number.isFinite(until)) throw Error("Choose a valid date range.");
        return { after: from, before: Math.min(until, Date.now()) };
    }
    async function run(mode: "preview" | "export" | "purge") {
        if (active || !enabled) return;
        let job: Job | undefined;
        try {
            const scope = channels.filter(c => selected.has(c.id));
            if (!scope.length) throw Error("Select at least one DM.");
            const preview = plan;
            if (mode === "purge" && (!preview || confirmation !== `DELETE ${preview.messages.length}` || preview.owner !== api.owner())) throw Error("Scan again and enter the confirmation shown below.");
            const limits = range();
            // Capture the theme before a potentially long export changes the UI.
            const theme = mode === "export" ? captureTheme() : undefined;
            job = new Job(api, update => { if (mounted.current) setProgress(update); }, Math.max(1000, Math.min(10000, delay || 1500)));
            active = job; setBusy(true); setStatus("");
            if (mode === "purge") {
                setPlan(undefined); setConfirmation("");
                await job.purge(preview!);
                if (mounted.current) setStatus(`Deleted ${job.progress.deleted.toLocaleString()} of your messages. ${job.progress.missing} were already gone.`);
            } else {
                invalidate();
                const result = await job.scan(scope, limits, mode === "preview" ? "purge" : "export");
                if (mode === "preview") {
                    if (mounted.current) { setPlan(result); setStatus(`Preview ready: ${result.messages.length.toLocaleString()} of your messages can be deleted. Nothing has been deleted.`); }
                } else {
                    result.messages = result.messages.map(enrich);
                    job.assertAccount();
                    const name = `DMsManager-${new Date().toISOString().replace(/[:.]/g, "-")}`;
                    if (format === "html") download(`${name}.html`, renderExport(result, theme!), "text/html;charset=utf-8");
                    else download(`${name}.json`, JSON.stringify({ format: 1, exportedAt: new Date().toISOString(), theme, ...result }, null, 2), "application/json;charset=utf-8");
                    if (mounted.current) setStatus(`Exported ${result.messages.length.toLocaleString()} messages from ${result.channels.length} conversations.`);
                }
            }
        } catch (error) {
            if (mounted.current) setStatus(`${error instanceof Error ? error.message : "Operation failed."}${job?.progress.deleted ? ` ${job.progress.deleted} messages were already deleted.` : ""}`);
        } finally { if (active === job) active = undefined; if (mounted.current) setBusy(false); }
    }
    const visible = channels.filter(c => `${c.name} ${c.id}`.toLowerCase().includes(search.toLowerCase()));
    const user = UserStore.getCurrentUser();
    return <Modal title="DMsManager" subtitle="Your conversations, your layout." size="xl" transitionState={transitionState} onClose={close} actions={[{ text: "Close", variant: "secondary", onClick: close }]}>
        <div className="dmm">
            <div className="dmm-account"><span>Signed in as <strong>{user?.globalName || user?.username || "Logged out"}</strong></span><code>{account}</code></div>
            <div className="dmm-grid">
                <section className="dmm-sidebar"><Heading tag="h3">Conversations <span className="dmm-count">{selected.size} selected</span></Heading>
                    <input aria-label="Search DMs" placeholder="Search name or channel ID" value={search} disabled={busy} onChange={e => setSearch(e.currentTarget.value)} />
                    <div className="dmm-actions"><Button size="xs" variant="secondary" disabled={busy} onClick={() => { setSelected(new Set(visible.map(c => c.id))); invalidate(); }}>Select results</Button>
                        <Button size="xs" variant="secondary" disabled={busy} onClick={() => { setSelected(new Set()); invalidate(); }}>Clear</Button>
                        <Button size="xs" variant="secondary" disabled={busy} onClick={() => { setChannels(conversations()); invalidate(); }}>Refresh</Button></div>
                    <div className="dmm-channels">{visible.map(c => <label key={c.id} className={selected.has(c.id) ? "dmm-channel selected" : "dmm-channel"}>
                        <input type="checkbox" checked={selected.has(c.id)} disabled={busy} onChange={e => { const next = new Set(selected); if (e.currentTarget.checked) next.add(c.id); else next.delete(c.id); setSelected(next); invalidate(); }} />
                        <span>{c.name}<small>{c.id}</small></span></label>)}{!visible.length && <p>No matching DMs.</p>}</div>
                    <p className="dmm-help">DMs and group DMs currently in your DM list. Closed conversations aren't recovered automatically.</p>
                </section>
                <section className="dmm-options"><Heading tag="h3">Date range</Heading><p className="dmm-help">Optional. Dates use UTC; the end date includes the whole day.</p>
                    <div className="dmm-dates"><label>From<input type="date" value={after} disabled={busy} onChange={e => { setAfter(e.currentTarget.value); invalidate(); }} /></label><label>Through<input type="date" value={before} disabled={busy} onChange={e => { setBefore(e.currentTarget.value); invalidate(); }} /></label></div>
                    <div className="dmm-panel dmm-export"><div className="dmm-card-heading"><span className="dmm-card-symbol" aria-hidden="true">↓</span><Heading tag="h3">Export</Heading></div><p>Save the full conversation with your current theme and available guild tags.</p>
                        <div className="dmm-format"><Select
                            options={[{ label: "Themed HTML", value: "html" }, { label: "JSON archive", value: "json" }]}
                            placeholder="Export format" isDisabled={busy} closeOnSelect={true}
                            select={setFormat} isSelected={value => value === format} serialize={value => value}
                        /></div>
                        <Button disabled={busy || !selected.size} onClick={() => void run("export")}>Export selected DMs</Button>
                        <p className="dmm-help">Media uses online links. Theme colors, font, and layout are captured; custom theme effects aren't copied.</p></div>
                    <div className="dmm-panel dmm-delete"><div className="dmm-card-heading"><span className="dmm-card-symbol" aria-hidden="true">×</span><Heading tag="h3">Delete your messages</Heading><span className="dmm-permanent">Permanent</span></div><p>Scan first. Only your ordinary messages and replies are eligible. Deletion is permanent.</p>
                        <label>Request spacing (milliseconds)<input type="number" min={1000} max={10000} step={100} value={delay} disabled={busy} onChange={e => setDelay(Number(e.currentTarget.value))} /></label>
                        <Button variant="secondary" disabled={busy || !selected.size} onClick={() => void run("preview")}>Scan and preview</Button>
                        {plan && <div className="dmm-confirm"><strong>{plan.messages.length.toLocaleString()} of your messages · {plan.channels.length} DMs</strong>
                            <div className="dmm-samples">{plan.messages.slice(0, 5).map(m => <div key={m.id}>{m.timestamp.slice(0, 10)} · {m.content.slice(0, 100) || "[Attachment / empty message]"}</div>)}</div>
                            <label>Type <code>DELETE {plan.messages.length}</code><input value={confirmation} onChange={e => setConfirmation(e.currentTarget.value)} disabled={busy} autoComplete="off" /></label>
                            <Button variant="dangerPrimary" disabled={busy || !plan.messages.length || confirmation !== `DELETE ${plan.messages.length}`} onClick={() => void run("purge")}>Delete {plan.messages.length.toLocaleString()} of my messages</Button></div>}
                    </div>
                </section>
            </div>
            {(busy || status) && <div className="dmm-status" role="status">{status || progress?.phase}<div className="dmm-help">{progress && `Scanned ${progress.scanned.toLocaleString()} · Matched ${progress.matched.toLocaleString()} · Deleted ${progress.deleted.toLocaleString()}${progress.total ? ` / ${progress.total.toLocaleString()}` : ""}`}</div>{busy && <><div>{progress?.channel}</div><div className="dmm-actions"><Button variant="secondary" size="small" onClick={() => active?.pause()}>{progress?.paused ? "Resume" : "Pause"}</Button><Button variant="dangerSecondary" size="small" onClick={() => active?.cancel("Cancelled. A request already in flight may still finish.")}>Cancel</Button></div></>}</div>}
        </div>
    </Modal>;
}
function dmMenu(children: any[], props: any) {
    const channel = props.channel;
    const id = channel?.id ?? (props.user && ChannelStore.getSortedPrivateChannels().find(c => c.type === 1 && c.recipients.includes(props.user.id))?.id);
    if (!validId(id) || !api.privateChannel(id)) return;
    children.push(<Menu.MenuItem id="dms-manager" label="DMsManager" action={() => openManager(id)} />);
}
export default definePlugin({
    name: "DMsManager", description: "Manage your DMs, delete your messages, and export conversations with your theme and guild tags.",
    authors: [{ name: "perishxd", id: 1113854342517243904n }], settings,
    toolboxActions: { "Open DMsManager": () => openManager() },
    contextMenus: { "user-context": dmMenu, "gdm-context": dmMenu, "channel-context": dmMenu },
    start() { enableStyle(pluginStyle); enabled = true; UserStore.addChangeListener(accountChanged); },
    stop() { enabled = false; active?.cancel("DMsManager disabled."); UserStore.removeChangeListener(accountChanged); if (modalKey) closeModal(modalKey); disableStyle(pluginStyle); }
});
