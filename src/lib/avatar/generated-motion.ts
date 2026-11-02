import * as THREE from "three";

/** Apply a bounded local tracking offset without overwriting the rig's bind
 * orientation. Slerp avoids Euler wrap jumps and frame-rate dependent snaps.
 */
export function applyGeneratedHeadPose(head: THREE.Bone, pose: { x: number; y: number; z: number } | null | undefined, delta: number): void {
  head.userData.avatarAceBaseHeadQuaternion ??= head.quaternion.clone();
  head.userData.avatarAcePoseOffset ??= new THREE.Quaternion();
  const rest = head.userData.avatarAceBaseHeadQuaternion as THREE.Quaternion;
  const current = head.userData.avatarAcePoseOffset as THREE.Quaternion;
  const valid = pose && [pose.x, pose.y, pose.z].every(Number.isFinite);
  const target = valid ? new THREE.Quaternion().setFromEuler(new THREE.Euler(
    THREE.MathUtils.clamp(pose.x, -0.65, 0.65),
    THREE.MathUtils.clamp(pose.y, -0.9, 0.9),
    THREE.MathUtils.clamp(pose.z, -0.45, 0.45), "YXZ",
  )) : new THREE.Quaternion();
  const dt = Number.isFinite(delta) ? THREE.MathUtils.clamp(delta, 0, 0.1) : 0;
  current.slerp(target, 1 - Math.exp(-12 * dt));
  head.quaternion.copy(rest).multiply(current);
}