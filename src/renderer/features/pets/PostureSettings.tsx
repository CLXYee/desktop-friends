import { useEffect, useState, type ReactNode } from 'react';
import {
  defaultPostureSchedule,
  isTimeOfDay,
  MAX_AWAY_MINUTES,
  MAX_IDLE_MINUTES,
  MIN_IDLE_MINUTES,
} from '../../../shared/posture';
import type { CompanionSettings, CompanionSettingsUpdate, Posture } from '../../../shared/types';

interface PostureSettingsProps {
  characterName: string;
  /** Characters with the "leave" gesture study in rounds and step out between them. */
  canTakeBreaks: boolean;
  settings: CompanionSettings;
  onChange: (patch: CompanionSettingsUpdate) => void;
}

interface MinutesInputProps {
  label: string;
  value: number;
  max: number;
  onCommit: (minutes: number) => void;
}

/** Keeps a draft so the field can be briefly empty or out of range while typing. */
function MinutesInput({ label, value, max, onCommit }: MinutesInputProps) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  return (
    <input
      className="routine-input routine-input-minutes"
      type="number"
      inputMode="numeric"
      aria-label={label}
      min={MIN_IDLE_MINUTES}
      max={max}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        const minutes = Number(event.target.value);
        if (Number.isInteger(minutes) && minutes >= MIN_IDLE_MINUTES && minutes <= max) onCommit(minutes);
      }}
      onBlur={() => setDraft(String(value))}
    />
  );
}

interface RoutineStepProps {
  icon: string;
  title: string;
  isCurrent: boolean;
  children: ReactNode;
}

function RoutineStep({ icon, title, isCurrent, children }: RoutineStepProps) {
  return (
    <li className={`routine-step${isCurrent ? ' routine-step-current' : ''}`}>
      <span className="routine-icon" aria-hidden="true">{icon}</span>
      <div className="routine-text">
        <strong>
          {title}
          {isCurrent && <span className="routine-now">now</span>}
        </strong>
        <span className="routine-detail">{children}</span>
      </div>
    </li>
  );
}

export function PostureSettings({ characterName, canTakeBreaks, settings, onChange }: PostureSettingsProps) {
  const isDefault = settings.idleMinutes === defaultPostureSchedule.idleMinutes
    && settings.bedtime === defaultPostureSchedule.bedtime
    && settings.wakeTime === defaultPostureSchedule.wakeTime
    && settings.leaveAfterMinutes === defaultPostureSchedule.leaveAfterMinutes
    && settings.awayMinutes === defaultPostureSchedule.awayMinutes;
  const isCurrent = (posture: Posture) => settings.autoPosture && settings.activity === posture;

  return (
    <section className="routine-card" aria-labelledby="routine-title">
      <header className="routine-header">
        <div>
          <p className="routine-eyebrow">FRIEND BEHAVIOR</p>
          <h3 id="routine-title">{characterName}&apos;s routine</h3>
        </div>
        <label className="routine-switch">
          <input
            type="checkbox"
            role="switch"
            checked={settings.autoPosture}
            onChange={(event) => onChange({ autoPosture: event.target.checked })}
          />
          <span className="routine-switch-track" aria-hidden="true"><span /></span>
          <span className="routine-switch-label">{settings.autoPosture ? 'Auto' : 'Off'}</span>
        </label>
      </header>

      <fieldset className="routine-steps" disabled={!settings.autoPosture}>
        <legend className="routine-legend">Automatic posture</legend>
        <ol>
          <RoutineStep icon="👋" title="Waving" isCurrent={isCurrent('waving')}>
            When the app opens or you touch {characterName}
          </RoutineStep>
          <RoutineStep icon="📚" title="Studying" isCurrent={isCurrent('studying')}>
            After
            <MinutesInput
              label="Minutes alone before studying"
              value={settings.idleMinutes}
              max={MAX_IDLE_MINUTES}
              onCommit={(idleMinutes) => onChange({ idleMinutes })}
            />
            min alone
          </RoutineStep>
          {canTakeBreaks && (
            <RoutineStep icon="🚪" title="Taking a break" isCurrent={isCurrent('away')}>
              After
              <MinutesInput
                label="Minutes of studying before a break"
                value={settings.leaveAfterMinutes}
                max={MAX_IDLE_MINUTES}
                onCommit={(leaveAfterMinutes) => onChange({ leaveAfterMinutes })}
              />
              min studying, back in
              <MinutesInput
                label="Minutes away on a break"
                value={settings.awayMinutes}
                max={MAX_AWAY_MINUTES}
                onCommit={(awayMinutes) => onChange({ awayMinutes })}
              />
              min
            </RoutineStep>
          )}
          <RoutineStep icon="🌙" title="Sleeping" isCurrent={isCurrent('sleeping')}>
            When alone at night
            <span className="routine-time-range">
              <input
                className="routine-input"
                type="time"
                aria-label="Bedtime"
                value={settings.bedtime}
                onChange={(event) => {
                  if (isTimeOfDay(event.target.value)) onChange({ bedtime: event.target.value });
                }}
              />
              <span aria-hidden="true">–</span>
              <input
                className="routine-input"
                type="time"
                aria-label="Wake-up time"
                value={settings.wakeTime}
                onChange={(event) => {
                  if (isTimeOfDay(event.target.value)) onChange({ wakeTime: event.target.value });
                }}
              />
            </span>
          </RoutineStep>
        </ol>
      </fieldset>

      <footer className="routine-footer">
        <span>
          {settings.autoPosture
            ? `${characterName} picks a posture on its own.`
            : `Pinned to ${settings.activity}. Switch on to let ${characterName} choose.`}
        </span>
        <button
          className="routine-reset"
          type="button"
          disabled={isDefault}
          onClick={() => onChange({ ...defaultPostureSchedule })}
        >
          Reset
        </button>
      </footer>
    </section>
  );
}
