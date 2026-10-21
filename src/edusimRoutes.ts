export const EDUSIM_ROUTES = {
  home: '/',
  eduvent: '/eduvent',
  edumon: '/edumon',
  edumonAna: '/edumon/ana',
  edumonIcu: '/edumon/icu',
  scenarios: '/scenarios',
} as const

export type EdusimRoute = (typeof EDUSIM_ROUTES)[keyof typeof EDUSIM_ROUTES]
