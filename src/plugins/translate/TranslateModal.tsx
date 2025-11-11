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

import { Divider } from "@components/Divider";
import { FormSwitch } from "@components/FormSwitch";
import { Margins } from "@utils/margins";
import { ModalCloseButton, ModalContent, ModalHeader, ModalProps, ModalRoot } from "@utils/modal";
import { Button, Forms, SearchableSelect, SelectedChannelStore, useMemo, useState } from "@webpack/common";

import { settings } from "./settings";
import { cl, getLanguages } from "./utils";

const LanguageSettingKeys = ["receivedInput", "receivedOutput", "sentInput", "sentOutput"] as const;

function LanguageSelect({ settingsKey, includeAuto }: { settingsKey: typeof LanguageSettingKeys[number]; includeAuto: boolean; }) {
    const currentValue = settings.use([settingsKey])[settingsKey];

    const options = useMemo(
        () => {
            const options = Object.entries(getLanguages()).map(([value, label]) => ({ value, label }));
            if (!includeAuto)
                options.shift();

            return options;
        }, []
    );

    return (
        <section className={Margins.bottom16}>
            <Forms.FormTitle tag="h3">
                {settings.def[settingsKey].description}
            </Forms.FormTitle>

            <SearchableSelect
                options={options}
                value={options.find(o => o.value === currentValue)}
                placeholder={"Select a language"}
                maxVisibleItems={5}
                closeOnSelect={true}
                onChange={v => settings.store[settingsKey] = v}
            />
        </section>
    );
}

function AutoTranslateToggle() {
    const value = settings.use(["autoTranslate"]).autoTranslate;

    return (
        <FormSwitch
            title="Auto Translate"
            description={settings.def.autoTranslate.description}
            value={value}
            onChange={v => settings.store.autoTranslate = v}
            hideBorder
        />
    );
}

function AutoTranslateReceivedToggle() {
    const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
    const isActive = settings.use(["autoTranslateReceived"]).autoTranslateReceived;

    const updateTimeRemaining = () => {
        if (!isActive || !settings.store.autoTranslateTimestamp) {
            setTimeRemaining(null);
            return;
        }
        const elapsed = Date.now() - settings.store.autoTranslateTimestamp;
        const remaining = Math.max(0, 10 * 60 * 1000 - elapsed);
        if (remaining === 0) {
            settings.store.autoTranslateReceived = false;
            settings.store.autoTranslateChannelId = null;
            settings.store.autoTranslateTimestamp = null;
            setTimeRemaining(null);
        } else {
            setTimeRemaining(remaining);
        }
    };

    useMemo(() => {
        if (!isActive) return;
        const interval = setInterval(updateTimeRemaining, 1000);
        updateTimeRemaining();
        return () => clearInterval(interval);
    }, [isActive]);

    const toggleAutoTranslateReceived = () => {
        const newValue = !isActive;
        settings.store.autoTranslateReceived = newValue;
        if (newValue) {
            settings.store.autoTranslateChannelId = SelectedChannelStore.getChannelId();
            settings.store.autoTranslateTimestamp = Date.now();
        } else {
            settings.store.autoTranslateChannelId = null;
            settings.store.autoTranslateTimestamp = null;
        }
        setTimeRemaining(newValue ? 10 * 60 * 1000 : null);
    };

    const formatTime = (ms: number) => {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    };

    return (
        <section className={Margins.bottom16}>
            <Forms.FormTitle tag="h3">
                Auto-Translate This Channel
            </Forms.FormTitle>
            <Forms.FormText className={Margins.bottom8}>
                Automatically translate all incoming messages in the current channel for 10 minutes
            </Forms.FormText>
            <Button
                color={isActive ? Button.Colors.RED : Button.Colors.BRAND}
                onClick={toggleAutoTranslateReceived}
            >
                {isActive && timeRemaining !== null
                    ? `Disable (${formatTime(timeRemaining)} remaining)`
                    : "Enable for 10 minutes"}
            </Button>
        </section>
    );
}


export function TranslateModal({ rootProps }: { rootProps: ModalProps; }) {
    return (
        <ModalRoot {...rootProps}>
            <ModalHeader className={cl("modal-header")}>
                <Forms.FormTitle tag="h2" className={cl("modal-title")}>
                    Translate
                </Forms.FormTitle>
                <ModalCloseButton onClick={rootProps.onClose} />
            </ModalHeader>

            <ModalContent className={cl("modal-content")}>
                {LanguageSettingKeys.map(s => (
                    <LanguageSelect
                        key={s}
                        settingsKey={s}
                        includeAuto={s.endsWith("Input")}
                    />
                ))}

                <Divider className={Margins.bottom16} />

                <AutoTranslateReceivedToggle />

                <Divider className={Margins.bottom16} />

                <AutoTranslateToggle />
            </ModalContent>
        </ModalRoot>
    );
}
