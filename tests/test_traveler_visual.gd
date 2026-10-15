extends SceneTree
## Validate mobile visual budgets and a usable static NPC duplicate, without world imports.

const SCENE_FIXTURE := preload("res://tests/scene_fixture.gd")
const PLAYER := preload("res://scripts/player.gd")

var checks := 0
var failures := 0


func check(condition: bool, label: String) -> void:
	checks += 1
	if condition:
		print("PASS: " + label)
	else:
		failures += 1
		push_error("FAIL: " + label)


func _initialize() -> void:
	call_deferred("run")


func run() -> void:
	for action in [
		"move_left", "move_right", "move_forward", "move_backward", "toggle_view", "jump"
	]:
		if not InputMap.has_action(action):
			InputMap.add_action(action)
	var player := PLAYER.new()
	root.add_child(player)
	player.set_physics_process(false)
	await process_frame
	var model: Node3D = player.model
	check_layered_attire(model)
	var meshes := model.find_children("*", "MeshInstance3D", true, false)
	var triangle_count := 0
	var all_finite := true
	var all_uvs := true
	var all_normals := true
	var palette := {}
	var textures := {}
	var bounds := AABB()
	var first := true
	for node: MeshInstance3D in meshes:
		palette[node.material_override.get_instance_id()] = true
		var texture: Texture2D = node.material_override.albedo_texture
		if texture != null:
			textures[texture.get_instance_id()] = true
		var transform: Transform3D = model.global_transform.affine_inverse() * node.global_transform
		for surface in range(node.mesh.get_surface_count()):
			var arrays := node.mesh.surface_get_arrays(surface)
			var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
			var indices = arrays[Mesh.ARRAY_INDEX]
			triangle_count += (
				(indices.size() if indices != null and indices.size() > 0 else vertices.size()) / 3
			)
			all_uvs = all_uvs and arrays[Mesh.ARRAY_TEX_UV] != null
			all_normals = all_normals and arrays[Mesh.ARRAY_NORMAL] != null
			for vertex in vertices:
				var position: Vector3 = transform * vertex
				all_finite = all_finite and position.is_finite()
				bounds = AABB(position, Vector3.ZERO) if first else bounds.expand(position)
				first = false
			for normal: Vector3 in arrays[Mesh.ARRAY_NORMAL]:
				all_normals = (
					all_normals and normal.is_finite() and absf(normal.length() - 1.0) < 0.02
				)
	check(
		meshes.size() <= 40,
		"traveler stays within 40 animated/static mesh draws including the drawn jian"
	)
	check(triangle_count > 1000 and triangle_count <= 12000, "traveler remains below 12k triangles")
	check(palette.size() <= 8, "clothing and equipment share at most 8 palette materials")
	check(textures.size() == 1, "one original weave texture serves all cloth colors")
	check(all_finite and all_normals, "all transformed vertices and unit normals are finite")
	check(all_uvs, "every visible surface supplies texture coordinates")
	check(bounds.size.y > 1.6 and bounds.size.y < 1.85, "human silhouette remains at meter scale")
	check(bounds.size.x < 0.8 and bounds.size.z < 0.75, "equipment keeps a compact walking outline")
	var paired := true
	for joints in [player.arms, player.elbows, player.legs, player.knees, player.coat_tails]:
		paired = paired and joints.size() == 2
		for joint: Node3D in joints:
			paired = paired and model.is_ancestor_of(joint)
	check(paired, "both sides retain articulated arms, elbows, legs, knees and cloth")
	var copy: Node3D = model.duplicate()
	root.add_child(copy)
	check(
		(
			copy.get_script() == null
			and copy.find_children("*", "MeshInstance3D", true, false).size() == meshes.size()
		),
		"NPC duplicate retains complete attire without player input or physics"
	)
	check(
		copy.get_meta("lantern_hip", Vector3.ZERO).is_equal_approx(Vector3(0.25, 0.88, 0.02)),
		"NPC/player visual exposes unobstructed right-hip lantern attachment"
	)
	var shapes := player.find_children("*", "CollisionShape3D", false, false)
	check(
		(
			shapes.size() == 1
			and shapes[0].shape is CapsuleShape3D
			and is_equal_approx(shapes[0].shape.height, 1.7)
			and is_equal_approx(shapes[0].shape.radius, 0.35)
		),
		"decorative upgrade preserves the single 1.7m traversal capsule"
	)
	player.first_person = true
	player.update_camera()
	check(not model.visible, "first-person hides every new garment and accessory")
	player.first_person = false
	player.update_camera()
	check(
		model.visible and player.spring_arm.spring_length > 0,
		"third-person restores complete attire"
	)
	await test_articulation(player)
	print("TRAVELER_GEOMETRY: %d draws, %d triangles" % [meshes.size(), triangle_count])
	print("TRAVELER_RESULT: %d checks, %d failures" % [checks, failures])
	copy.free()
	await SCENE_FIXTURE.dispose_scene(self, player)
	quit(1 if failures else 0)


func check_layered_attire(model: Node3D) -> void:
	var mantle := model.get_node_or_null("TailoredAttire/ShoulderMantle") as Node3D
	check(mantle != null, "traveler wears a separate layered shoulder mantle")
	if mantle == null:
		return
	var panels := mantle.find_children("*", "MeshInstance3D", true, false)
	var bounds := AABB()
	var first := true
	for panel: MeshInstance3D in panels:
		var box := panel.transform * panel.mesh.get_aabb()
		bounds = box if first else bounds.merge(box)
		first = false
	check(panels.size() == 2, "mantle cloth and embroidered border share two material batches")
	check(
		bounds.size.x > 0.45 and bounds.size.y > 0.2,
		"mantle geometry spans the shoulders and upper back"
	)
	check(
		mantle.position.y > 1.2 and mantle.position.y < 1.4,
		"mantle stays attached above the traversal waist"
	)


func test_articulation(player: CharacterBody3D) -> void:
	# The real physics body must animate the new hierarchy, not merely build it.
	var floor_body := StaticBody3D.new()
	var floor_shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(20, 0.2, 20)
	floor_shape.shape = box
	floor_shape.position.y = -0.1
	floor_body.add_child(floor_shape)
	root.add_child(floor_body)
	for action in [
		"move_left", "move_right", "move_forward", "move_backward", "toggle_view", "jump"
	]:
		if not InputMap.has_action(action):
			InputMap.add_action(action)
	player.set_physics_process(true)
	for i in range(20):
		await physics_frame
	check(player.is_on_floor(), "upgraded silhouette settles on the original traversal capsule")
	Input.action_press("move_forward")
	var limb_motion := 0.0
	var cloth_motion := 0.0
	for i in range(30):
		await physics_frame
		limb_motion = maxf(limb_motion, absf(player.legs[0].rotation.x))
		cloth_motion = maxf(cloth_motion, absf(player.coat_tails[0].rotation.x))
	Input.action_release("move_forward")
	check(limb_motion > 0.1, "walking the real body articulates the new legs")
	check(cloth_motion > 0.1, "walking the real body sways the split coat panels")
	player.set_physics_process(false)
	floor_body.free()
