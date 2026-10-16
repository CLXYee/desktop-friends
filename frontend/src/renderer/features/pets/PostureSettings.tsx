import { useEffect, useState, type ReactNode } from 'react';
import {
  defaultPostureSchedule,
  formatDuration,
  isDuration,
  isTimeOfDay,
  parseDuration,
  type DurationField,
} from '../../../shared/posture';
import type { CompanionSettings, CompanionSettingsUpdate, Posture } from '../../../shared/types';

interface PostureSettingsProps {
  characterName: string;
  /** Characters with the "leave" gesture study in rounds and step out between them. */
  canTakeBreaks: boolean;
  settings: CompanionSettings;
  onChange: (patch: CompanionSettingsUpdate) => void;
}

interface DurationInputProps {
  label: string;
  field: DurationField;
  value: number;
  onCommit: (seconds: number) => void;
}

/** An "m:ss" field (a plain number means minutes). Keeps a draft while typing; invalid drafts aren't saved. */
function DurationInput({ label, field, value, onCommit }: DurationInputProps) {
  const [draft, setDraft] = useState(formatDuration(value));
  useEffect(() => setDraft(formatDuration(value)), [value]);
  const parsed = parseDuration(draft);
  const isValid = parsed !== null && isDuration(field, parsed);

  return (
    <input
      className={`routine-input routine-input-duration${isValid ? '' : ' routine-input-invalid'}`}
      type="text"
      inputMode="numeric"
      placeholder="m:ss"
      aria-label={`${label} (minutes:seconds)`}
      aria-invalid={!isValid}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        const seconds = parseDuration(event.target.value);
        if (seconds !== null && isDuration(field, seconds)) onCommit(seconds);
      }}
      onBlur={() => setDraft(formatDuration(value))}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
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
  const isDefault = settings.idleSeconds === defaultPostureSchedule.idleSeconds
    && settings.bedtime === defaultPostureSchedule.bedtime
    && settings.wakeTime === defaultPostureSchedule.wakeTime
    && settings.studySeconds === defaultPostureSchedule.studySeconds
    && settings.breakSeconds === defaultPostureSchedule.breakSeconds;
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
            <DurationInput
              label="Time alone before studying"
              field="idleSeconds"
              value={settings.idleSeconds}
              onCommit={(idleSeconds) => onChange({ idleSeconds })}
            />
            alone
          </RoutineStep>
          {canTakeBreaks && (
            <RoutineStep icon="🚪" title="Taking a break" isCurrent={isCurrent('away')}>
              After
              <DurationInput
                label="Focus session length"
                field="studySeconds"
                value={settings.studySeconds}
                onCommit={(studySeconds) => onChange({ studySeconds })}
              />
              of focus, back in
              <DurationInput
                label="Break length"
                field="breakSeconds"
                value={settings.breakSeconds}
                onCommit={(breakSeconds) => onChange({ breakSeconds })}
              />
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

      <label className="routine-timer-toggle">
        <input
          type="checkbox"
          checked={settings.showTimer}
          disabled={!settings.autoPosture}
          onChange={(event) => onChange({ showTimer: event.target.checked })}
        />
        <span>Show a countdown above {characterName}</span>
      </label>

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
