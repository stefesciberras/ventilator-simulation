import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import '../interactive-vent-controls.css'

export interface InteractiveSettingSpec<Key extends string = string> {
  key: Key
  label: string
  value: number
  display: string
  unit?: string
  min: number
  max: number
  step: number
}

interface InteractiveSettingControlsProps<Key extends string> {
  controls: InteractiveSettingSpec<Key>[]
  onChange: (key: Key, value: number) => void
  overlayTargetSelector: string
  disabled?: boolean
  className?: string
  ariaLabel?: string
  settleMs?: number
}

export function InteractiveSettingControls<Key extends string>({
  controls,
  onChange,
  overlayTargetSelector,
  disabled = false,
  className = '',
  ariaLabel = 'Interactive settings',
  settleMs = 5200,
}: InteractiveSettingControlsProps<Key>) {
  const [activeKey, setActiveKey] = useState<Key | null>(null)
  const [overlayTarget, setOverlayTarget] = useState<HTMLElement | null>(null)
  const settleTimerRef = useRef<number | null>(null)

  const activeControl = controls.find((control) => control.key === activeKey) ?? null

  const clearSettleTimer = () => {
    if (settleTimerRef.current != null) window.clearTimeout(settleTimerRef.current)
    settleTimerRef.current = null
  }

  const armSettleTimer = () => {
    clearSettleTimer()
    settleTimerRef.current = window.setTimeout(() => {
      settleTimerRef.current = null
      setActiveKey(null)
    }, settleMs)
  }

  useEffect(() => {
    const findTarget = () => {
      const candidates = Array.from(document.querySelectorAll<HTMLElement>(overlayTargetSelector))
      const target = candidates.find((candidate) => candidate.isConnected && candidate.getClientRects().length > 0)
        ?? candidates.find((candidate) => candidate.isConnected)
        ?? null
      setOverlayTarget((current) => current === target ? current : target)
    }
    findTarget()
    const observer = new MutationObserver(findTarget)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] })
    window.addEventListener('resize', findTarget)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', findTarget)
    }
  }, [overlayTargetSelector])

  useEffect(() => () => clearSettleTimer(), [])

  useEffect(() => {
    if (disabled) setActiveKey(null)
    if (activeKey && !controls.some((control) => control.key === activeKey)) setActiveKey(null)
  }, [activeKey, controls, disabled])

  const selectControl = (key: Key) => {
    if (disabled) return
    if (activeKey === key) {
      clearSettleTimer()
      setActiveKey(null)
      return
    }
    setActiveKey(key)
    armSettleTimer()
  }

  const applyValue = (value: number) => {
    if (!activeControl || disabled) return
    onChange(activeControl.key, value)
    armSettleTimer()
  }

  return (
    <div className={`interactive-setting-controls ${className}`.trim()} aria-label={ariaLabel}>
      <div className="interactive-vent-summary">
        {controls.map((control) => (
          <button
            key={control.key}
            type="button"
            className={`interactive-setting-button ${activeKey === control.key ? 'active' : ''}`.trim()}
            disabled={disabled}
            onClick={() => selectControl(control.key)}
            aria-pressed={activeKey === control.key}
            title={disabled ? `${control.label} is locked` : `Adjust ${control.label}`}
          >
            <span>{control.label}</span>
            <strong><b>{control.display}</b>{control.unit && <small>{control.unit}</small>}</strong>
          </button>
        ))}
      </div>

      {activeControl && !disabled && overlayTarget && createPortal(
        <div className="interactive-slider-panel" role="group" aria-label={`Adjust ${activeControl.label}`}>
          <span>{activeControl.label}</span>
          <input
            className="interactive-vent-slider"
            type="range"
            min={activeControl.min}
            max={activeControl.max}
            step={activeControl.step}
            value={activeControl.value}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId)
              armSettleTimer()
            }}
            onPointerUp={armSettleTimer}
            onPointerCancel={armSettleTimer}
            onKeyDown={armSettleTimer}
            onInput={(event) => applyValue(Number(event.currentTarget.value))}
            onChange={(event) => applyValue(Number(event.currentTarget.value))}
          />
          <strong>{activeControl.display}{activeControl.unit ? ` ${activeControl.unit}` : ''}</strong>
        </div>,
        overlayTarget,
      )}
    </div>
  )
}
