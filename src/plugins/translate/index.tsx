/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import "./styles.css";

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { Message } from "@vencord/discord-types";
import { ChannelStore, Menu, MessageStore, SelectedChannelStore } from "@webpack/common";

import { settings } from "./settings";
import { setShouldShowTranslateEnabledTooltip, TranslateChatBarIcon, TranslateIcon } from "./TranslateIcon";
import { handleTranslate, TranslationAccessory } from "./TranslationAccessory";
import { translate, translateBatch } from "./utils";

const messageCtxPatch: NavContextMenuPatchCallback = (children, { message }: { message: Message; }) => {
    const content = getMessageContent(message);
    if (!content) return;

    const group = findGroupChildrenByChildId("copy-text", children);
    if (!group) return;

    group.splice(group.findIndex(c => c?.props?.id === "copy-text") + 1, 0, (
        <Menu.MenuItem
            id="vc-trans"
            label="Translate"
            icon={TranslateIcon}
            action={async () => {
                const trans = await translate("received", content);
                handleTranslate(message.id, trans);
            }}
        />
    ));
};


export function getMessageContent(message: Message) {
    return message.content
        || message.messageSnapshots?.[0]?.message.content
        || message.embeds?.find(embed => embed.type === "auto_moderation_message")?.rawDescription || "";
}

let tooltipTimeout: any;
let autoTranslateTimeout: any;
let visibilityCheckInterval: any;
let scrollDebounceTimeout: any;
const translatedMessages = new Set<string>();

function isAutoTranslateActive(): boolean {
    const now = Date.now();
    const timestamp = settings.store.autoTranslateTimestamp;
    if (!timestamp || !settings.store.autoTranslateReceived) return false;
    if (now - timestamp > 10 * 60 * 1000) {
        settings.store.autoTranslateReceived = false;
        settings.store.autoTranslateChannelId = null;
        settings.store.autoTranslateTimestamp = null;
        return false;
    }
    return true;
}

async function translateVisibleMessages(channelId: string): Promise<void> {
    const messageElements = document.querySelectorAll(`[id^="chat-messages-${channelId}-"]`);
    const visibleMessageIds: string[] = [];

    messageElements.forEach(el => {
        const rect = el.getBoundingClientRect();
        const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;

        if (isVisible) {
            const id = el.id.replace(`chat-messages-${channelId}-`, "");
            if (id && !translatedMessages.has(id)) {
                visibleMessageIds.push(id);
            }
        }
    });

    if (visibleMessageIds.length === 0) return;

    const messages = MessageStore.getMessages(channelId);
    if (!messages) return;

    const messagesToTranslate: Array<{ id: string; content: string }> = [];

    for (const messageId of visibleMessageIds) {
        const message = messages.get(messageId);
        if (!message) continue;

        const content = getMessageContent(message);
        if (!content) continue;

        messagesToTranslate.push({ id: messageId, content });
    }

    if (messagesToTranslate.length === 0) return;

    try {
        const translations = await translateBatch(
            "received",
            messagesToTranslate.map(m => m.content)
        );

        for (let i = 0; i < messagesToTranslate.length; i++) {
            const messageId = messagesToTranslate[i].id;
            const translation = translations[i];

            handleTranslate(messageId, translation);
            translatedMessages.add(messageId);
        }
    } catch (e) {
        console.error("Batch auto-translate failed:", e);
    }
}

export function startContinuousTranslation(channelId: string): void {
    stopContinuousTranslation();
    translatedMessages.clear();

    translateVisibleMessages(channelId);

    visibilityCheckInterval = setInterval(() => {
        if (!isAutoTranslateActive() || settings.store.autoTranslateChannelId !== channelId) {
            stopContinuousTranslation();
            return;
        }
        translateVisibleMessages(channelId);
    }, 2000);

    const chatScroller = document.querySelector('[class*="scrollerInner"]');
    if (chatScroller) {
        const handleScroll = () => {
            if (!isAutoTranslateActive() || settings.store.autoTranslateChannelId !== channelId) return;

            clearTimeout(scrollDebounceTimeout);
            scrollDebounceTimeout = setTimeout(() => {
                translateVisibleMessages(channelId);
            }, 1000);
        };

        chatScroller.addEventListener("scroll", handleScroll);
    }
}

export function stopContinuousTranslation(): void {
    if (visibilityCheckInterval) {
        clearInterval(visibilityCheckInterval);
        visibilityCheckInterval = null;
    }
    if (scrollDebounceTimeout) {
        clearTimeout(scrollDebounceTimeout);
        scrollDebounceTimeout = null;
    }
    translatedMessages.clear();
}

export default definePlugin({
    name: "Translate",
    description: "Translate messages with Google Translate or DeepL",
    authors: [Devs.Ven, Devs.AshtonMemer],
    settings,
    contextMenus: {
        "message": messageCtxPatch
    },

    start() {
        if (isAutoTranslateActive() && settings.store.autoTranslateChannelId) {
            startContinuousTranslation(settings.store.autoTranslateChannelId);
        }
    },

    stop() {
        stopContinuousTranslation();
    },

    flux: {
        async MESSAGE_CREATE({ message, optimistic }) {
            if (optimistic) return;
            if (!isAutoTranslateActive()) return;

            const currentChannelId = SelectedChannelStore.getChannelId();
            if (settings.store.autoTranslateChannelId !== currentChannelId) return;

            const content = getMessageContent(message);
            if (!content) return;

            try {
                const trans = await translate("received", content);
                handleTranslate(message.id, trans);
                translatedMessages.add(message.id);
            } catch (e) {
                console.error("Auto-translate failed:", e);
            }
        }
    },
    // not used, just here in case some other plugin wants it or w/e
    translate,

    renderMessageAccessory: props => <TranslationAccessory message={props.message} />,

    renderChatBarButton: TranslateChatBarIcon,

    renderMessagePopoverButton(message: Message) {
        const content = getMessageContent(message);
        if (!content) return null;

        return {
            label: "Translate",
            icon: TranslateIcon,
            message,
            channel: ChannelStore.getChannel(message.channel_id),
            onClick: async () => {
                const trans = await translate("received", content);
                handleTranslate(message.id, trans);
            }
        };
    },

    async onBeforeMessageSend(_, message) {
        if (!settings.store.autoTranslate) return;
        if (!message.content) return;

        setShouldShowTranslateEnabledTooltip?.(true);
        clearTimeout(tooltipTimeout);
        tooltipTimeout = setTimeout(() => setShouldShowTranslateEnabledTooltip?.(false), 2000);

        const trans = await translate("sent", message.content);
        message.content = trans.text;
    }
});
