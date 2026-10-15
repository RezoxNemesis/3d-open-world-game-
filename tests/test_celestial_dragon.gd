extends SceneTree
## Real imported skin/animation, bounded flight and reversible mobile quality.

const DRAGON := preload("res://scripts/celestial_dragon.gd")

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
	var world := Node3D.new()
	root.add_child(world)
	var camera := Camera3D.new()
	world.add_child(camera)
	camera.position = Vector3(0, 65, -100)
	camera.current = true
	var dragon := DRAGON.new()
	world.add_child(dragon)
	dragon.build(world)
	dragon.set_process(false)
	await process_frame
	check(dragon.get_child_count() == 1, "one bounded flight node owns the imported creature")
	dragon.build(world)
	check(dragon.get_child_count() == 1, "rebuilding does not duplicate geometry or rigs")
	check(dragon._lods.size() == 2, "two separately authored geometry LODs are available")
	var counts: Array[int] = []
	for model: Node3D in dragon._lods:
		counts.append(await test_imported_rig(model))
	check(
		counts.size() == 2 and counts[1] < counts[0] * 0.7,
		"far silhouette reduces the actual imported triangle count by over thirty percent"
	)
	test_path(dragon)
	check(
		dragon.find_children("*", "CollisionObject3D", true, false).is_empty(),
		"distant creature adds no player collider or combat body"
	)
	dragon.apply_quality("high")
	check(
		dragon._flight_root.visible and dragon._lods[0].visible and not dragon._lods[1].visible,
		"high quality selects the near model inside its distance threshold"
	)
	dragon.apply_quality("balanced")
	check(
		dragon._flight_root.visible and not dragon._lods[0].visible and dragon._lods[1].visible,
		"balanced uses the lower cost real skin"
	)
	dragon.apply_quality("performance")
	var paused := true
	for animator: AnimationPlayer in dragon._players:
		paused = paused and not animator.active
	check(
		not dragon._flight_root.visible and paused,
		"performance culls geometry and pauses animation"
	)
	dragon.apply_quality("high")
	check(
		dragon._flight_root.visible and dragon._lods[0].visible and dragon._players[0].active,
		"returning from performance restores the chosen animated LOD"
	)
	camera.position = Vector3(1000, 65, -100)
	dragon.apply_quality("high")
	check(not dragon._flight_root.visible, "camera distance culls even the high quality creature")
	camera.position = Vector3(0, 65, -100)
	dragon.apply_quality("balanced")
	check(
		dragon._flight_root.visible and dragon._lods[1].visible and dragon._players[1].active,
		"returning within range restores the correct LOD and live animation"
	)
	var start_position: Vector3 = dragon._flight_root.position
	dragon._process(2.0)
	check(
		dragon._flight_root.position.distance_to(start_position) > 1.0,
		"the actual built flight node advances around the bounded path"
	)
	check(
		dragon._flight_root.transform.is_finite(),
		"heading and bank remain a finite transform on the live node"
	)
	print("DRAGON_RESULT: %d checks, %d failures; LOD triangles %s" % [checks, failures, counts])
	world.free()
	await process_frame
	quit(1 if failures else 0)


func test_imported_rig(model: Node3D) -> int:
	var meshes := model.find_children("*", "MeshInstance3D", true, false)
	var skeletons := model.find_children("*", "Skeleton3D", true, false)
	check(
		meshes.size() == 1 and skeletons.size() == 1,
		"%s is one mesh and one real skeleton" % model.name
	)
	if meshes.size() != 1 or skeletons.size() != 1:
		return 0
	var mesh_node: MeshInstance3D = meshes[0]
	var skeleton: Skeleton3D = skeletons[0]
	check(
		(
			skeleton.get_bone_count() == 20
			and mesh_node.skin != null
			and mesh_node.skin.get_bind_count() == 20
		),
		"%s imports twenty bound deform joints" % model.name
	)
	check(
		mesh_node.cast_shadow == GeometryInstance3D.SHADOW_CASTING_SETTING_OFF,
		"%s never renders expensive distant shadows" % model.name
	)
	var triangles := 0
	var finite := true
	var attributes := true
	var normalized := true
	var smooth_vertices := 0
	for surface in range(mesh_node.mesh.get_surface_count()):
		var arrays := mesh_node.mesh.surface_get_arrays(surface)
		var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
		var normals: PackedVector3Array = arrays[Mesh.ARRAY_NORMAL]
		var uv: PackedVector2Array = arrays[Mesh.ARRAY_TEX_UV]
		var bones: PackedInt32Array = arrays[Mesh.ARRAY_BONES]
		var weights: PackedFloat32Array = arrays[Mesh.ARRAY_WEIGHTS]
		var indices: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
		triangles += indices.size() / 3
		attributes = (
			attributes and normals.size() == vertices.size() and uv.size() == vertices.size()
		)
		attributes = (
			attributes and bones.size() >= vertices.size() * 4 and weights.size() == bones.size()
		)
		for vertex in vertices:
			finite = finite and vertex.is_finite()
		for normal in normals:
			finite = finite and normal.is_finite() and absf(normal.length() - 1.0) < 0.02
		for coordinate in uv:
			finite = finite and coordinate.is_finite()
		if vertices.is_empty():
			continue
		var stride := weights.size() / vertices.size()
		for vertex in range(vertices.size()):
			var total := 0.0
			var influences := 0
			for slot in range(stride):
				var weight := weights[vertex * stride + slot]
				total += weight
				if weight > 0.001:
					influences += 1
				normalized = normalized and is_finite(weight) and weight >= 0.0
			if influences > 1:
				smooth_vertices += 1
			normalized = normalized and absf(total - 1.0) < 0.002
	check(
		triangles > 2000 and triangles < 8000,
		"%s stays under eight thousand real triangles" % model.name
	)
	check(mesh_node.mesh.get_surface_count() <= 6, "%s uses at most six draw surfaces" % model.name)
	check(
		attributes and finite,
		"%s has finite normals, coordinates and complete skin data" % model.name
	)
	check(
		normalized and smooth_vertices > 400,
		"%s blends normalized weights along its spine" % model.name
	)
	var bounds := mesh_node.mesh.get_aabb()
	check(
		bounds.size.z > 30.0 and bounds.size.x > 5.0 and bounds.size.y > 4.0,
		"%s is substantial three dimensional head/limbs/body geometry" % model.name
	)
	var animator := model.find_child("AnimationPlayer", true, false) as AnimationPlayer
	check(animator != null and animator.is_playing(), "%s plays an imported animation" % model.name)
	if animator != null:
		animator.active = true
		var animation := animator.get_animation(animator.current_animation)
		check(
			animation.loop_mode == Animation.LOOP_LINEAR and animation.length >= 5.9,
			"%s retains a six second cyclic joint animation" % model.name
		)
		animator.seek(0.0, true)
		animator.advance(0.0)
		var tail := skeleton.find_bone("Spine_13")
		var before := skeleton.get_bone_pose_rotation(tail)
		var before_tip := skeleton.get_bone_global_pose(tail).origin
		animator.advance(1.5)
		await process_frame
		check(
			before.angle_to(skeleton.get_bone_pose_rotation(tail)) > 0.02,
			"%s actually articulates its tail joint during playback" % model.name
		)
		check(
			before_tip.distance_to(skeleton.get_bone_global_pose(tail).origin) > 0.2,
			"%s swimming displaces the skinned tail along the joint chain" % model.name
		)
	return triangles


func test_path(dragon: Node3D) -> void:
	var bounded := true
	var closed := true
	var deterministic := true
	for index in range(1001):
		var time := -200.0 + index * 0.47
		var point: Vector3 = dragon.path_position(time)
		bounded = bounded and point.is_finite() and absf(point.x) <= 65.001
		bounded = bounded and point.z >= -130.001 and point.z <= -69.999
		bounded = bounded and point.y >= 50.0 and point.y <= 75.001
		closed = (
			closed and point.distance_to(dragon.path_position(time + dragon.FLIGHT_PERIOD)) < 0.001
		)
		deterministic = deterministic and point.is_equal_approx(dragon.path_position(time))
	check(
		bounded, "one thousand path samples stay above fifty meters in the northern mountain sector"
	)
	check(closed and deterministic, "flight repeats the same closed path including negative time")
	check(
		dragon.path_position(0.0).distance_to(dragon.path_position(19.0)) > 40.0,
		"different elapsed times produce meaningfully different flight positions"
	)
	var seam_a: Vector3 = dragon.path_position(dragon.FLIGHT_PERIOD - 0.001)
	var seam_b: Vector3 = dragon.path_position(0.001)
	check(
		seam_a.distance_to(seam_b) < 0.02, "the closed flight loop has no position jump at its seam"
	)
