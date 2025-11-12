import { showNotification } from "@api/Notifications";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { ChannelStore, GuildStore, NavigationRouter, UserStore } from "@webpack/common";

const settings = definePluginSettings({
    keywords: {
        type: OptionType.STRING,
        description: "Comma-separated keywords to monitor",
        default: "",
        placeholder: "keyword1, keyword2, keyword3"
    },
    caseSensitive: {
        type: OptionType.BOOLEAN,
        description: "Enable case-sensitive keyword matching",
        default: false
    },
    ignoreSelf: {
        type: OptionType.BOOLEAN,
        description: "Don't notify for your own messages",
        default: true
    },
    ignoreBots: {
        type: OptionType.BOOLEAN,
        description: "Don't notify for bot messages",
        default: true
    },
    showPreview: {
        type: OptionType.BOOLEAN,
        description: "Show message preview in notification",
        default: true
    }
});

export default definePlugin({
    name: "KeywordNotifier",
    description: "Get notifications when specific keywords appear in any message",
    authors: [Devs.Ven],
    settings,

    flux: {
        MESSAGE_CREATE({ message, optimistic }) {
            if (optimistic) return;

            const currentUser = UserStore.getCurrentUser();

            if (settings.store.ignoreSelf && message.author.id === currentUser.id) return;
            if (settings.store.ignoreBots && message.author.bot) return;

            const keywords = settings.store.keywords
                .split(",")
                .map(k => k.trim())
                .filter(k => k.length > 0);

            if (keywords.length === 0) return;

            const content = settings.store.caseSensitive
                ? message.content
                : message.content.toLowerCase();

            const matchedKeywords = keywords.filter(keyword => {
                const searchKeyword = settings.store.caseSensitive
                    ? keyword
                    : keyword.toLowerCase();
                return content.includes(searchKeyword);
            });

            if (matchedKeywords.length === 0) return;

            const channel = ChannelStore.getChannel(message.channel_id);
            const guild = message.guild_id ? GuildStore.getGuild(message.guild_id) : null;

            let title: string;
            if (guild && channel) {
                title = `Keyword in ${guild.name} > #${channel.name}`;
            } else if (channel?.name) {
                title = `Keyword in ${channel.name}`;
            } else {
                title = `Keyword in DM with ${message.author.username}`;
            }

            const preview = settings.store.showPreview
                ? message.content.substring(0, 100)
                : `Contains: ${matchedKeywords.join(", ")}`;

            showNotification({
                title,
                body: `${message.author.username}: ${preview}`,
                icon: message.author.getAvatarURL?.(undefined, undefined, false),
                permanent: false,
                dismissOnClick: true,
                onClick: () => {
                    const channelPath = message.guild_id
                        ? `/channels/${message.guild_id}/${message.channel_id}/${message.id}`
                        : `/channels/@me/${message.channel_id}/${message.id}`;
                    NavigationRouter.transitionTo(channelPath);
                }
            });
        }
    }
});
