// Weapon handling: the gun is placed where it belongs (stock in the shoulder / pistol at eye level, barrel exactly along
// the aim direction) and both arms are solved onto it with two-bone IK, on whatever skeleton the character uses
// (the scanned hero avatars or the procedural body of NPCs). Fingers close around the grip.
import * as THREE from 'three';

const V = THREE.Vector3, Q = THREE.Quaternion, M4 = THREE.Matrix4;
const _pq = new Q(), _wq = new Q(), _t = new Q(), _a = new V(), _b = new V(), _c = new V(), _n = new V(), _x = new V(), _y = new V(), _ax = new V();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function setWorldQ(bone, wq) { bone.parent.getWorldQuaternion(_pq); bone.quaternion.copy(_pq.invert().multiply(wq)); bone.updateMatrixWorld(true); }
function rotWorld(bone, q) { bone.getWorldQuaternion(_wq); setWorldQ(bone, _t.copy(q).multiply(_wq)); }
const angle = (u, v) => Math.acos(clamp(u.dot(v) / Math.max(1e-9, u.length() * v.length()), -1, 1));

// analytic two-bone IK in world space: end reaches `target`, the middle joint swings towards `pole`
export function twoBoneIK(up, lo, end, target, pole) {
  const a = up.getWorldPosition(new V()), b = lo.getWorldPosition(new V()), c = end.getWorldPosition(new V());
  const lab = a.distanceTo(b), lcb = b.distanceTo(c), lat = clamp(a.distanceTo(target), Math.abs(lab - lcb) + 1e-3, lab + lcb - 1e-3);
  const ca = _a.subVectors(c, a), ba = _b.subVectors(b, a), ab = _c.subVectors(a, b), cb = new V().subVectors(c, b);
  const A0 = angle(ca, ba), B0 = angle(ab, cb);
  const A1 = Math.acos(clamp((lcb * lcb - lab * lab - lat * lat) / (-2 * lab * lat), -1, 1)), B1 = Math.acos(clamp((lat * lat - lab * lab - lcb * lcb) / (-2 * lab * lcb), -1, 1));
  _ax.crossVectors(ca, ba); if (_ax.lengthSq() < 1e-10) _ax.crossVectors(ca, pole); if (_ax.lengthSq() < 1e-10) _ax.set(1, 0, 0); _ax.normalize();
  const ax = _ax.clone();
  rotWorld(up, new Q().setFromAxisAngle(ax, A1 - A0)); rotWorld(lo, new Q().setFromAxisAngle(ax, B1 - B0));
  end.getWorldPosition(c);
  rotWorld(up, new Q().setFromUnitVectors(_a.subVectors(c, a).normalize(), _b.subVectors(target, a).normalize()));
  // swing the elbow around the shoulder -> target axis towards the pole
  lo.getWorldPosition(b); _n.subVectors(target, a).normalize();
  _x.subVectors(b, a); _x.addScaledVector(_n, -_x.dot(_n)); _y.copy(pole).addScaledVector(_n, -pole.dot(_n));
  if (_x.lengthSq() > 1e-8 && _y.lengthSq() > 1e-8) { _x.normalize(); _y.normalize(); const ang = Math.atan2(_c.crossVectors(_x, _y).dot(_n), _x.dot(_y)); rotWorld(up, new Q().setFromAxisAngle(_n, ang)); }
}

// gun-local reference points (origin at the top of the pistol grip, +Z along the barrel, +Y up, +X to the shooter's left)
export const GUNS = {
  rifle: { butt: -0.3, guard: new V(0, 0.006, 0.29), muzzle: new V(0, 0.043, 0.535), grip: new V(0, -0.05, -0.012) },
  pistol: { butt: 0, guard: new V(0.034, -0.05, 0.0), muzzle: new V(0, 0.031, 0.14), grip: new V(0, -0.045, -0.012) },
};
// how the gun sits in the right hand (hand frame of the procedural rest pose: fingers -Y, thumb +Z, palm +X):
// barrel along the knuckles, top of the gun on the thumb side, the middle of the grip in the palm
export function seatGun(gun, kind = 'rifle') { const g = GUNS[kind].grip; gun.rotation.set(Math.PI / 2, 0, 0); gun.position.set(0.022 - g.x, -0.085 + g.z, 0.02 - g.y); }

const basis = (x, y, z) => new Q().setFromRotationMatrix(new M4().makeBasis(x, y, z));
export class WeaponRig {
  constructor() { this.k = 0; this.aimK = 0; this.rest = new Map(); this.curled = false; }
  // S: { upR, loR, handR, upL, loL, handL, convL (avatar hand = procedural-equivalent x convL), fingersR, fingersL }
  // st: { gun, rifle, held, aim, yaw, dir (Vector3 aim direction, world), since (seconds since the last shot), dt }
  update(S, st) {
    const dt = st.dt || 1 / 60, lerpK = (r) => 1 - Math.exp(-r * dt);
    const want = st.held && (st.rifle || st.aim) ? 1 : 0;
    this.k += (want - this.k) * lerpK(want ? 14 : 9); this.aimK += ((st.aim ? 1 : 0) - this.aimK) * lerpK(11);
    if (!st.held) { this.uncurl(S); if (this.k < 0.01) { this.k = 0; return; } }
    if (this.k < 0.004 || !st.gun) { if (st.held) this.curl(S, false); return; }
    const gun = st.gun, G = st.rifle ? GUNS.rifle : GUNS.pistol, K = this.k, aimK = this.aimK;
    // aim frame: forward along the body, then pitched to the aim direction
    const f0 = new V(Math.sin(st.yaw), 0, Math.cos(st.yaw)), up = new V(0, 1, 0), r = new V().crossVectors(f0, up).normalize();
    const d = st.dir ? st.dir.clone().normalize() : f0.clone();
    const pitch = clamp(Math.asin(clamp(d.y, -1, 1)), -1.05, 1.05), kick = st.since >= 0 && st.since < 0.3 ? Math.exp(-st.since * 18) : 0;
    const fA = f0.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(up, Math.sin(pitch)).applyAxisAngle(r, kick * (st.rifle ? 0.05 : 0.2));
    // low-ready (rifle carried across the body): barrel down and to the left
    const fC = f0.clone().applyAxisAngle(r, -0.72).applyAxisAngle(up, 0.5);
    const f = fC.clone().lerp(fA, st.rifle ? aimK : 1).normalize();
    const sR = S.upR.getWorldPosition(new V()), sL = S.upL.getWorldPosition(new V());
    let O;
    if (st.rifle) {
      const uA = new V().crossVectors(r, fA).normalize();
      const oA = sR.clone().addScaledVector(fA, -G.butt + 0.05 - kick * 0.03).addScaledVector(r, -0.075).addScaledVector(uA, 0.07);
      const oC = sR.clone().addScaledVector(f0, 0.2).addScaledVector(r, -0.1).addScaledVector(up, -0.27);
      O = oC.lerp(oA, aimK);
    } else {
      const uA = new V().crossVectors(r, fA).normalize();
      O = sR.clone().lerp(sL, 0.42).addScaledVector(fA, 0.44 - kick * 0.05).addScaledVector(uA, 0.055);
    }
    // gun world frame (x = shooter's left, y = up, z = barrel)
    const gx = new V().crossVectors(up, f).normalize(), gy = new V().crossVectors(f, gx).normalize(), Qg = basis(gx, gy, f);
    if (st.rifle && aimK < 0.999) Qg.multiply(new Q().setFromAxisAngle(new V(0, 0, 1), -0.35 * (1 - aimK)));     // carried slightly canted
    // remember the incoming arm pose so the rig can blend in and out
    const bones = [S.upR, S.loR, S.handR, S.upL, S.loL, S.handL], before = K < 0.999 ? bones.map((b) => b.quaternion.clone()) : null;
    // right hand: where the hand bone must be for the gun (a rigid child of it) to sit at O / Qg
    S.handR.updateWorldMatrix(true, true);
    const L = new M4().copy(S.handR.matrixWorld).invert().multiply(gun.matrixWorld);
    const gs = gun.getWorldScale(new V()), Mh = new M4().compose(O, Qg, gs).multiply(L.invert());
    const hp = new V(), hq = new Q(), hs = new V(); Mh.decompose(hp, hq, hs);
    twoBoneIK(S.upR, S.loR, S.handR, hp, new V().addScaledVector(up, -0.8).addScaledVector(r, 0.62).addScaledVector(f0, -0.15));
    setWorldQ(S.handR, hq);
    // left hand: under the handguard (rifle) or wrapped around the grip (pistol)
    const two = st.rifle ? 1 : aimK;
    if (two > 0.02) {
      const toW = (v) => v.clone().applyQuaternion(Qg);
      const F = toW(st.rifle ? new V(-0.76, 0, 0.65) : new V(-0.42, -0.3, 0.86).normalize());                       // wrist -> knuckles
      const N = toW(st.rifle ? new V(0, 1, 0) : new V(-0.9, 0, -0.42)); N.addScaledVector(F, -N.dot(F)).normalize();   // palm normal
      const wrist = O.clone().add(toW(G.guard)).addScaledVector(F, -0.085).addScaledVector(N, -0.028);
      const lb = two < 0.999 ? [S.upL, S.loL, S.handL].map((b) => b.quaternion.clone()) : null;
      twoBoneIK(S.upL, S.loL, S.handL, wrist, new V().addScaledVector(up, -0.85).addScaledVector(r, -0.5).addScaledVector(f0, -0.1));
      // left hand rest frame: fingers -Y, palm -X  =>  X -> -N, Y -> -F
      const hx = N.clone().negate(), hy = F.clone().negate(), hz = new V().crossVectors(hx, hy);
      const ql = basis(hx, hy, hz); if (S.convL) ql.multiply(S.convL);
      setWorldQ(S.handL, ql);
      if (lb) [S.upL, S.loL, S.handL].forEach((b, i) => { b.quaternion.copy(lb[i].slerp(b.quaternion, two)); });
    }
    if (before) bones.forEach((b, i) => { b.quaternion.copy(before[i].slerp(b.quaternion, K)); });
    this.curl(S, two > 0.5);
  }
  // close the fingers around the grip (avatars only; the procedural body has mitten hands)
  curl(S, left) {
    const one = (list, hand, sign, amt) => {
      if (!list || !list.length) return;
      hand.updateWorldMatrix(true, false);
      for (const b of list) { if (!this.rest.has(b)) this.rest.set(b, b.quaternion.clone()); b.quaternion.copy(this.rest.get(b)); }
      if (amt <= 0) return;
      // bend axis from the hand's own frame: fingers run from the wrist to the knuckles, the palm normal closes them
      const wp = hand.getWorldPosition(new V()); let mid = null; for (const b of list) if (/Finger2$/.test(b.name)) mid = b;
      if (!mid) return;
      const F = mid.getWorldPosition(new V()).sub(wp).normalize(); let thumb = null; for (const b of list) if (/Finger0$/.test(b.name)) thumb = b;
      const T = thumb ? thumb.getWorldPosition(new V()).sub(wp) : new V(0, 0, 1); T.addScaledVector(F, -T.dot(F)).normalize();
      const N = new V().crossVectors(F, T).multiplyScalar(sign).normalize();                    // palm normal
      const ax = new V().crossVectors(F, N).normalize();
      for (const b of list) {
        const th = /Finger0/.test(b.name), root = /Finger\d$/.test(b.name);
        rotWorld(b, new Q().setFromAxisAngle(ax, amt * (th ? 0.25 : root ? 0.75 : 1.0)));
      }
    };
    one(S.fingersR, S.handR, -1, 0.95); one(S.fingersL, S.handL, 1, left ? 0.8 : 0);
    this.curled = true;
  }
  uncurl(S) { if (!this.curled) return; this.curled = false; for (const [b, q] of this.rest) b.quaternion.copy(q); }
}
