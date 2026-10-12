import { useEffect, useState, type ReactNode } from 'react';
import { defaultPostureSchedule, isIdleMinutes, isTimeOfDay, MAX_IDLE_MINUTES, MIN_IDLE_MINUTES } from '../../../shared/posture';
import type { Activity, CompanionSettings, CompanionSettingsUpdate } from '../../../shared/types';

interface PostureSettingsProps {
  characterName: string;
  settings: CompanionSettings;
  onChange: (patch: CompanionSettingsUpdate) => void;
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

export function PostureSettings({ characterName, settings, onChange }: PostureSettingsProps) {
  // Keep a draft so the number field can be briefly empty or out of range while typing.
  const [idleDraft, setIdleDraft] = useState(String(settings.idleMinutes));
  useEffect(() => setIdleDraft(String(settings.idleMinutes)), [settings.idleMinutes]);

  const isDefault = settings.idleMinutes === defaultPostureSchedule.idleMinutes
    && settings.bedtime === defaultPostureSchedule.bedtime
    && settings.wakeTime === defaultPostureSchedule.wakeTime;
  const isCurrent = (activity: Activity) => settings.autoPosture && settings.activity === activity;

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
            <input
              className="routine-input routine-input-minutes"
              type="number"
              inputMode="numeric"
              aria-label="Minutes alone before studying"
              min={MIN_IDLE_MINUTES}
              max={MAX_IDLE_MINUTES}
              value={idleDraft}
              onChange={(event) => {
                setIdleDraft(event.target.value);
                const minutes = Number(event.target.value);
                if (isIdleMinutes(minutes)) onChange({ idleMinutes: minutes });
              }}
              onBlur={() => setIdleDraft(String(settings.idleMinutes))}
            />
            min alone
          </RoutineStep>
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
