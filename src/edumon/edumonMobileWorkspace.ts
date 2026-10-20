import { installMobileWorkspaceRuntime } from '../components/mobileWorkspaceRuntime'
import './edumon-mobile-workspace.css'

export function installEdumonMobileWorkspace() {
  installMobileWorkspaceRuntime({
    appSelector: '.edumon-app-shell',
    workspaceSelector: '.edumon-workspace',
    switcherClassName: 'edumon-mobile-workspace-switcher',
    ariaLabel: 'EDUMON workspace pages',
    firstPage: { id: 'monitor', label: 'Display', className: 'mobile-page-monitor' },
    secondPage: { id: 'controls', label: 'Controls', className: 'mobile-page-controls' },
  })
}
