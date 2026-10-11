export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/api/health') {
      return Response.json({
        ok: true,
        service: 'ventilator-simulation',
        version: '0.1.0',
      })
    }

    return new Response(null, { status: 404 })
  },
}
