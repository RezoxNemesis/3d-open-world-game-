extends SceneTree
## Ocean continuity, real swimming collision and the sea creature's readable damage window.

const OCEAN := preload("res://scripts/expedition_ocean.gd")
const SWIMMING := preload("res://scripts/expedition_swimming.gd")
var checks := 0
var failures := 0


class Swimmer:
	extends CharacterBody3D
	var yaw := 0.0
	var powers: Node
	var water_motion: Node


class SeaWorld:
	extends Node3D
	var origin_sector := Vector2i(256, 0)
	var _player: CharacterBody3D


class Powers:
	extends Node
	var flying := false


func _initialize() -> void:
	call_deferred("run")


func run() -> void:
	var world := SeaWorld.new()
	root.add_child(world)
	var player := Swimmer.new()
	world.add_child(player)
	world._player = player
	player.set_physics_process(true)
	player.powers = Powers.new()
	player.add_child(player.powers)
	var shape := CollisionShape3D.new()
	var capsule := CapsuleShape3D.new()
	capsule.radius = .3
	capsule.height = 1.8
	shape.shape = capsule
	shape.position.y = .9
	player.add_child(shape)
	var swim := SWIMMING.new()
	world.add_child(swim)
	swim.setup(player, world)
	check(player.water_motion == swim, "water hook is attached to the actual body")
	check(
		OCEAN.is_sector(Vector2i(252, -4)) and not OCEAN.is_sector(Vector2i(251, -4)),
		"sea domain is bounded and separate from the temple"
	)
	check(
		is_equal_approx(
			OCEAN.floor_height(Vector2i(256, 0), Vector3(64, 0, 4)),
			OCEAN.floor_height(Vector2i(257, 0), Vector3(-64, 0, 4))
		),
		"adjacent ocean sectors share identical seabed heights"
	)
	check(
		is_equal_approx(OCEAN.floor_height(Vector2i(260, 0), Vector3(64, 0, 0)), .6),
		"sea border rises continuously to the coastal band"
	)
	player.position = Vector3(0, -1, 0)
	check(swim.is_swimming(), "immersed player enters water motion")
	player.powers.flying = true
	check(
		not swim.is_swimming() and swim.is_water_position(),
		"active flight takes precedence while retaining underwater bounds"
	)
	player.powers.flying = false
	world.origin_sector = Vector2i.ZERO
	check(not swim.is_swimming(), "ordinary temple land never activates ocean swimming")
	world.origin_sector = OCEAN.CENTER_SECTOR
	player.position.y = 1
	check(not swim.is_swimming(), "arrival above the surface falls normally into water")
	player.position.y = -8
	player.velocity = Vector3.ZERO
	Input.action_press("power_descend")
	var descending := swim.swim_velocity(Vector2.ZERO, false, .5)
	check(descending.y < -3, "DIVE requests downward motion")
	Input.action_release("power_descend")
	Input.action_press("jump")
	var ascending := swim.swim_velocity(Vector2.ZERO, false, .5)
	check(ascending.y > 3, "ASCEND requests upward motion")
	Input.action_release("jump")
	check(
		swim.status_text().contains("Spirit breathing"),
		"underwater HUD explicitly communicates unlimited spirit breathing"
	)
	player.position = Vector3(63, -8, 0)
	var before := swim.swim_velocity(Vector2.UP, false, .1)
	world.origin_sector += Vector2i.RIGHT
	player.position.x -= 128
	var after := swim.swim_velocity(Vector2.UP, false, .1)
	check(
		swim.is_swimming() and before.is_equal_approx(after) and player.position.y == -8,
		"origin rebase preserves swim velocity and depth without a teleport"
	)
	world.origin_sector = OCEAN.CENTER_SECTOR
	var bed := StaticBody3D.new()
	var bed_shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(40, 1, 40)
	bed_shape.shape = box
	bed.position.y = -18.5
	bed.add_child(bed_shape)
	world.add_child(bed)
	player.position = Vector3(0, -15, 0)
	Input.action_press("power_descend")
	for frame in range(100):
		await physics_frame
		player.velocity = swim.swim_velocity(Vector2.ZERO, false, 1.0 / 60)
		player.move_and_slide()
	Input.action_release("power_descend")
	check(
		player.position.y >= -18.02 and player.position.y < -17,
		"real collision prevents diving through the seabed"
	)
	Input.action_press("jump")
	for frame in range(60):
		await physics_frame
		player.velocity = swim.swim_velocity(Vector2.ZERO, false, 1.0 / 60)
		player.move_and_slide()
	Input.action_release("jump")
	check(player.position.y > -16, "swimmer ascends away from a real seabed contact")
	bed.free()
	var region := Node3D.new()
	world.add_child(region)
	var sea := OCEAN.build(region, OCEAN.CENTER_SECTOR, world)
	check(
		OCEAN.build(region, OCEAN.CENTER_SECTOR, world) == sea,
		"ocean decoration build is idempotent"
	)
	var triangles := 0
	var surfaces := 0
	for item in sea.find_children("*", "GeometryInstance3D", true, false):
		if not item.is_visible_in_tree():
			continue
		var mesh: Mesh = item.multimesh.mesh if item is MultiMeshInstance3D else item.mesh
		var count: int = item.multimesh.instance_count if item is MultiMeshInstance3D else 1
		triangles += mesh.get_faces().size() / 3 * count
		surfaces += mesh.get_surface_count()
	check(
		triangles <= 30000 and surfaces <= 15,
		"visible reef, textured ruins and near dragon fit the 30k/15-surface central budget"
	)
	check(
		sea.get_node("DrownedGateCollision").get_child_count() == 18,
		"underwater pillars, footings and broken stone fragments have matching solid collision"
	)
	var ruin_placements: PackedVector3Array = sea.get_node("DrownedGateRuins").get_meta(
		"instance_origins"
	)
	var ruin_shapes := sea.get_node("DrownedGateCollision").get_children()
	var matching_ruins := ruin_shapes.size() == ruin_placements.size()
	for index in range(ruin_shapes.size()):
		matching_ruins = (
			matching_ruins and ruin_shapes[index].position.is_equal_approx(ruin_placements[index])
		)
	check(matching_ruins, "every fallen stone collider shares its visible instance origin")
	print("OCEAN_GEOMETRY: ", triangles, " triangles / ", surfaces, " surfaces")
	var creature = sea.get_node("TideWyrm")
	creature.set_physics_process(false)
	var near_model: Node3D = creature.get_node("TideDragonNear")
	var far_model: Node3D = creature.get_node("TideDragonFar")
	var skeleton := near_model.find_child("*Skeleton*", true, false) as Skeleton3D
	if skeleton == null:
		skeleton = near_model.find_children("*", "Skeleton3D", true, false)[0]
	check(
		skeleton.get_bone_count() == 20 and near_model.scale.is_equal_approx(Vector3.ONE * .38),
		"twelve-meter tide wyrm retains its original twenty-joint authored skin"
	)
	var animator: AnimationPlayer = creature._animators[0]
	check(
		(
			animator.current_animation != ""
			and (
				animator.callback_mode_process
				== AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
			)
		),
		"authored swimming animation shares the AI's manual pause clock"
	)
	var tail := skeleton.find_bone("Spine_13")
	var before_tail := skeleton.get_bone_pose_rotation(tail)
	creature._animate(1.5)
	await process_frame
	check(
		before_tail.angle_to(skeleton.get_bone_pose_rotation(tail)) > .02,
		"the actual skinned tail changes pose during manual swimming playback"
	)
	creature.select_lod(80)
	check(
		(
			not near_model.visible
			and far_model.visible
			and not creature._animators[0].active
			and creature._animators[1].active
		),
		"far dragon replaces the near skin and animation instead of adding another draw"
	)
	creature.select_lod(10)
	check(
		near_model.visible and not far_model.visible,
		"approaching restores the detailed connected dragon skin"
	)
	var ruin_mesh: Mesh = sea.get_node("DrownedGateRuins").multimesh.mesh
	check(
		ruin_mesh.material.albedo_texture != null and ruin_mesh.material.normal_enabled,
		"ruins retain original stone albedo and normal texture detail"
	)
	player.position = creature.position + Vector3(0, 0, -8)
	creature._physics_process(.01)
	check(
		creature.state == "telegraph" and swim.health == 100,
		"nearby sea creature warns before dealing any damage"
	)
	var paused_remaining: float = creature._remaining
	var paused_position: Vector3 = creature.position
	var paused_animation: float = animator.current_animation_position
	player.set_physics_process(false)
	swim.process_mode = Node.PROCESS_MODE_DISABLED
	creature._physics_process(5)
	swim.receive_bite(25, Vector3.RIGHT)
	check(
		(
			creature.state == "telegraph"
			and creature._remaining == paused_remaining
			and creature.position == paused_position
			and animator.current_animation_position == paused_animation
			and swim.health == 100
		),
		"atlas ownership freezes creature motion, windup and damage"
	)
	player.set_physics_process(true)
	swim.process_mode = Node.PROCESS_MODE_INHERIT
	creature._physics_process(1.6)
	check(creature.state == "lunge", "telegraph completes before the committed lunge")
	for step in range(10):
		creature._physics_process(.1)
	check(swim.health == 75, "one lunge deals one bounded hit")
	swim.receive_bite(25, Vector3.RIGHT)
	check(swim.health == 75, "invulnerability blocks repeated immediate hits")
	swim._invulnerable = 0
	swim.receive_bite(100, Vector3.RIGHT)
	var recovery_position := player.position
	check(
		swim.health == 0 and swim.swim_velocity(Vector2.ZERO, false, .5).y > 0,
		"depleted sea ward initiates a physical ascent"
	)
	check(player.position == recovery_position, "sea recovery never teleports the body")
	player.position.y = -.8
	swim._process(.1)
	check(swim.health == 100, "reaching the surface restores the sea ward")
	var camera := Camera3D.new()
	world.add_child(camera)
	var prior := Environment.new()
	prior.fog_enabled = false
	camera.environment = prior
	camera.make_current()
	player.position = Vector3(0, -8, 0)
	camera.position = Vector3(0, -7, 3)
	await process_frame
	swim._process(.1)
	check(
		camera.environment != prior and camera.environment.fog_enabled and not prior.fog_enabled,
		"submerged camera gets isolated underwater fog without mutating weather"
	)
	camera.position.y = 2
	swim._process(.1)
	check(
		camera.environment == prior,
		"leaving the water restores the exact previous camera environment"
	)
	world.free()
	await process_frame
	print("OCEAN_RESULT: %d checks, %d failures" % [checks, failures])
	quit(1 if failures else 0)


func check(condition: bool, label: String) -> void:
	checks += 1
	if condition:
		print("PASS: " + label)
	else:
		failures += 1
		push_error("FAIL: " + label)
