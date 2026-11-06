import assert from 'node:assert/strict'
import { createMemoryAuthorityStore } from '../src/session-v2/authorityStore.mjs'
import { createLocalSessionHost } from '../src/session-v2/localSessionHost.mjs'
import { createInstructorPeer, parsePairing } from '../src/session-v2/peerSession.mjs'
// Wire/authorization test double; real ICE/LAN browser testing is separate.
const previous = globalThis.RTCPeerConnection
const sockets = []
class Peer {
  constructor(config) { assert.deepEqual(config.iceServers, []); this.iceGatheringState = 'complete' }
  createDataChannel(label, options) {
    assert.equal(label, 'loppjusim-v2'); assert.equal(options.ordered, true)
    const dc = { readyState: 'open', bufferedAmount: 0, messages: [],
      send(raw) { this.messages.push(JSON.parse(raw)) }, close() { this.readyState = 'closed' } }
    sockets.push(dc); return dc
  }
  async createOffer() { return { type: 'offer', sdp: 'test-sdp' } }
  async setLocalDescription(value) { this.localDescription = { toJSON: () => value } }
  async setRemoteDescription(value) { this.remoteDescription = value }
  close() {}
}
globalThis.RTCPeerConnection = Peer
const flush = async () => { for (let i=0;i<20;i++) await new Promise(resolve=>setTimeout(resolve,0)) }
try {
  let peer
  const host = await createLocalSessionHost({ sessionId: 'peer-test', store: createMemoryAuthorityStore(), onSnapshot: value=>peer?.publish(value) })
  peer = createInstructorPeer(host, 'peer-test')
  const offer = parsePairing(await peer.offer(), 'offer')
  assert.throws(()=>parsePairing('{}','offer'))
  await assert.rejects(peer.accept(JSON.stringify({...offer,token:'x'.repeat(36),description:{type:'answer',sdp:'test'}})),/another offer/)
  let socket = sockets.at(-1)
  socket.onmessage({data:JSON.stringify({protocol:2,type:'hello',token:'wrong'})}); await flush()
  assert.equal(socket.readyState,'closed')
  peer = createInstructorPeer(host, 'peer-test')
  const valid = parsePairing(await peer.offer(),'offer'); socket=sockets.at(-1)
  const send = async packet => { socket.onmessage({data:JSON.stringify({protocol:2,...packet})}); await flush() }
  await send({type:'hello',token:valid.token})
  assert.equal(socket.messages.at(-1).type,'welcome')
  assert.equal(socket.messages.at(-1).role,'candidate')
  const epoch=host.current.snapshot.session.epoch
  const cmd=(id,type,payload={})=>({type:'command',requestId:id,command:{id,type,payload,epoch,participantId:'instructor',internalClock:true}})
  await send({type:'clock.control',running:true,speed:4})
  assert.equal(host.current.clock.running,false)
  for (const type of ['reset','end','tick','patient.parameter.set','alarm.limits.set']) {
    await send(cmd(type,type,{path:'heartRate',value:20,deltaMs:1000}))
    assert.equal(socket.messages.at(-1).receipt.accepted,false,type)
  }
  await send(cmd('dose','action.invoke',{actionId:'propofol'}))
  assert.equal(socket.messages.at(-1).receipt.accepted,true)
  const state=structuredClone(host.current.snapshot.runtimes)
  await send(cmd('dose','action.invoke',{actionId:'propofol'}))
  assert.deepEqual(host.current.snapshot.runtimes,state)
  peer.close()
  peer=createInstructorPeer(host,'peer-test')
  const again=parsePairing(await peer.offer(),'offer');socket=sockets.at(-1)
  await send({type:'hello',token:again.token})
  assert.deepEqual(socket.messages.at(-1).snapshot.runtimes,state)
  await send(cmd('dose','action.invoke',{actionId:'propofol'}))
  assert.deepEqual(host.current.snapshot.runtimes,state)
  peer.close();host.close()
  console.log('Peer wire authentication, candidate permissions, re-pairing and drug deduplication passed')
} finally { globalThis.RTCPeerConnection=previous }
