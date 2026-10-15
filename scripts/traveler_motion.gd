extends RefCounted
## Visual-only human locomotion. Contact cadence follows resolved body displacement.
## The feet use an asymmetric stance/swing cycle and a two-link sagittal leg solve.

var phase := 0.0
var clock := 0.0
var gait := 0.0
var run_blend := 0.0
var landing := 0.0
var grounded_before := true
var fall_speed := 0.0
var last_heading := 0.0
var turn_lean := 0.0


func update(
	player: CharacterBody3D, delta: float, actual: Vector3, grounded: bool, flying: bool
) -> void:
	var blend := 1.0 - exp(-12.0 * delta)
	var speed := Vector2(actual.x, actual.z).length()
	var action: String = player.get_meta("traveler_action", "")
	var moving := grounded and not flying and action != "mounted" and speed > 0.08
	clock += delta
	gait = lerpf(gait, clampf(speed / 2.0, 0.0, 1.0) if moving else 0.0, blend)
	run_blend = lerpf(run_blend, clampf((speed - 4.5) / 3.5, 0.0, 1.0), blend)
	if moving:
		# Map the legacy fast traversal speeds to readable human cadence.
		phase += minf(speed / lerpf(3.2, 4.0, run_blend), 3.2) * TAU * delta
	if grounded and not grounded_before and not flying:
		landing = clampf(fall_speed / 14.0, 0.0, 1.0)
	if not grounded:
		fall_speed = maxf(0.0, -actual.y)
	else:
		fall_speed = 0.0
	grounded_before = grounded
	landing = move_toward(landing, 0.0, delta * 2.8)
	var old_heading: float = player.model.rotation.y
	if speed > 0.08 and action != "mounted":
		player.model.rotation.y = lerp_angle(old_heading, atan2(-actual.x, -actual.z), blend)
	var turning := angle_difference(last_heading, player.model.rotation.y) / maxf(delta, 0.001)
	last_heading = player.model.rotation.y
	turn_lean = lerpf(turn_lean, clampf(-turning * speed * 0.008, -0.14, 0.14), blend)
	player.model.rotation.z = lerpf(player.model.rotation.z, turn_lean, blend)
	var lean := -0.30 if flying else -0.065 * run_blend * gait
	player.model.rotation.x = lerpf(player.model.rotation.x, lean, blend)
	var bob := (1.0 - cos(phase * 2.0)) * 0.009 * gait
	player.model.position.y = lerpf(player.model.position.y, bob - landing * 0.12, blend)
	pose_chest(player, blend, flying)
	for index in range(2):
		pose_limb(player, index, blend, grounded, flying, action)
	player.step_time = phase
	player.gait_weight = gait


func pose_chest(player: CharacterBody3D, blend: float, flying: bool) -> void:
	var chest: Node3D = player.model.get_node("TailoredAttire")
	var breath := sin(clock * 1.9)
	var twist := sin(phase) * gait * lerpf(0.055, 0.10, run_blend)
	chest.rotation.y = lerpf(chest.rotation.y, twist if not flying else 0.0, blend)
	chest.rotation.z = lerpf(chest.rotation.z, sin(phase) * gait * 0.018, blend)
	chest.scale.y = 1.0 + breath * 0.0018 * (1.0 - gait * 0.6)
	# Rotate around the waist while retaining the legacy authored child coordinates.
	var waist := Vector3(0, 0.97, 0)
	chest.position = waist - chest.basis * waist + Vector3(0, breath * 0.002, 0)


func pose_limb(
	player: CharacterBody3D, index: int, blend: float, grounded: bool, flying: bool, action: String
) -> void:
	var side := -1.0 if index == 0 else 1.0
	var cycle := fposmod(phase / TAU + index * 0.5, 1.0)
	var stance := lerpf(0.62, 0.48, run_blend)
	var travel := lerpf(0.22, 0.34, run_blend)
	var foot_z: float
	var lift := 0.0
	if cycle < stance:
		foot_z = lerpf(-travel, travel, cycle / stance)
	else:
		var swing := (cycle - stance) / (1.0 - stance)
		foot_z = lerpf(travel, -travel, smoothstep(0.0, 1.0, swing))
		lift = sin(swing * PI) * lerpf(0.11, 0.24, run_blend)
	var target := Vector2(foot_z * gait, -0.72 + lift * gait + landing * 0.07)
	var distance := clampf(target.length(), 0.35, 0.729)
	var hip := atan2(-target.x, -target.y)
	hip += acos(
		clampf((0.36 * 0.36 + distance * distance - 0.37 * 0.37) / (0.72 * distance), -1, 1)
	)
	var knee := -(
		PI
		- acos(clampf((0.36 * 0.36 + 0.37 * 0.37 - distance * distance) / (2 * 0.36 * 0.37), -1, 1))
	)
	var arm := -sin(phase + index * PI) * gait * lerpf(0.30, 0.62, run_blend)
	var elbow := 0.16 + run_blend * 0.75 + gait * 0.09 * (1.0 + sin(phase + index * PI))
	var splay := side * -0.045
	var cloth := -0.06 - gait * (0.06 + 0.10 * sin(phase + index * PI - 0.6))
	if not grounded and not flying:
		hip = 0.30 if player.velocity.y > 0 else 0.12
		knee = -0.65 if player.velocity.y > 0 else -0.30
		arm = -0.28 if player.velocity.y > 0 else 0.18
		elbow = 0.55
		splay = -side * 0.18
		cloth = -0.28
	if action == "mounted":
		hip = 1.15
		knee = -1.25
		arm = 0.60
		elbow = 0.55
	if action == "attack":
		arm = 1.25 if index == 1 else -0.35
		elbow = 0.25
	if action == "dodge":
		hip += 0.45
		knee -= 0.65
		arm = 0.65
		player.model.position.y = lerpf(player.model.position.y, -0.16, blend)
	if flying:
		hip = -0.08
		knee = 0.12
		arm = 1.42
		elbow = -0.10
		splay = -side * 0.12
		cloth = -0.45
		player.model.position.y = lerpf(player.model.position.y, 0.0, blend)
	player.legs[index].rotation.x = lerpf(player.legs[index].rotation.x, hip, blend)
	player.knees[index].rotation.x = lerpf(player.knees[index].rotation.x, knee, blend)
	player.arms[index].rotation.x = lerpf(player.arms[index].rotation.x, arm, blend)
	player.arms[index].rotation.z = lerpf(player.arms[index].rotation.z, splay, blend)
	player.elbows[index].rotation.x = lerpf(player.elbows[index].rotation.x, elbow, blend)
	player.coat_tails[index].rotation.x = lerpf(
		player.coat_tails[index].rotation.x, cloth, blend * 0.65
	)
	# Shoulders follow torso counterrotation without reparenting established joints.
	var chest: Node3D = player.model.get_node("TailoredAttire")
	player.arms[index].position = chest.transform * Vector3(side * 0.218, 1.325, 0)
	player.arms[index].rotation.y = chest.rotation.y
