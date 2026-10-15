extends SceneTree

const NATURE := preload("res://scripts/nature.gd")
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


func triangles(mesh: Mesh) -> int:
	var count := 0
	for surface_index in range(mesh.get_surface_count()):
		var arrays := mesh.surface_get_arrays(surface_index)
		var indices: PackedInt32Array = (
			arrays[Mesh.ARRAY_INDEX] if arrays[Mesh.ARRAY_INDEX] != null else PackedInt32Array()
		)
		var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
		count += (indices.size() if not indices.is_empty() else vertices.size()) / 3
	return count


func run() -> void:
	var nature := NATURE.new()
	check_leaf_atlas()
	check(nature.route_or_water(Vector3(50, 0, -20)), "new upper stair corridor excludes plants")
	check(nature.route_or_water(Vector3(46, 10, -42)), "new upper terrace excludes plants")
	for point in [
		Vector3(-30, 0, -28),
		Vector3(-32.5, 6, -37),
		Vector3(-27.5, 0, 2),
		Vector3(-32, 6, -42),
		Vector3(-41, 6, -50),
		Vector3(-23, 6, -34)
	]:
		check(nature.route_or_water(point), "western route and shrine exclude plants at %s" % point)
	for point in [
		Vector3(20, 0.6, 31),
		Vector3(12.5, 0.6, 24.5),
		Vector3(27.5, 0.6, 37.5),
		Vector3(20, 0, 16),
		Vector3(11.5, 0, 25),
		Vector3(15, 0, 39),
		Vector3(20, 0, 39)
	]:
		check(
			nature.route_or_water(point),
			"residence and connected sidepath exclude plants at %s" % point
		)
	for direction in [Vector3.UP, Vector3.FORWARD, Vector3(1.3, 3.1, -2.0)]:
		var start := Vector3(3, 2, -5)
		var end: Vector3 = start + direction
		var branch: Transform3D = nature.branch_transform(start, end, 0.2)
		check(
			(
				(branch * Vector3(0, -0.5, 0)).distance_to(start) < 0.0001
				and (branch * Vector3(0, 0.5, 0)).distance_to(end) < 0.0001
				and absf(branch.basis.determinant()) > 0.0001
			),
			"branch endpoints remain exact for direction %s" % direction
		)
	var garden := Node3D.new()
	var replica := Node3D.new()
	nature.populate(garden, 73109)
	NATURE.new().populate(replica, 73109)
	var original_origins: Array = []
	var replica_origins: Array = []
	var content_triangles := 0
	var cover_clear := true
	var atlas_canopies := true
	var camera_only := true
	var batches := 0
	for item in garden.get_children():
		if item is MultiMeshInstance3D:
			batches += 1
			var origins: PackedVector3Array = item.get_meta("instance_origins")
			original_origins.append(origins)
			content_triangles += triangles(item.multimesh.mesh) * item.multimesh.instance_count
			if item.get_meta("near_cover", false):
				for point in origins:
					cover_clear = cover_clear and not nature.route_or_water(point)
			if item.name.begins_with("PineCanopies") or item.name.begins_with("FloweringCanopies"):
				var material = item.multimesh.mesh.surface_get_material(0)
				atlas_canopies = (
					atlas_canopies
					and material is ShaderMaterial
					and material.get_shader_parameter("use_atlas") == true
					and material.get_shader_parameter("foliage_atlas") is Texture2D
					and item.get_meta("density_scaled", false)
				)
		elif item is StaticBody3D:
			camera_only = camera_only and item.collision_layer == 2 and item.collision_mask == 0
	for item in replica.get_children():
		if item is MultiMeshInstance3D:
			replica_origins.append(item.get_meta("instance_origins"))
	check(original_origins == replica_origins, "botanical placement recreates exactly from seed")
	check(cover_clear, "all meadow cover respects authored paths, pools, stairs and terrace")
	check(
		atlas_canopies, "pine and flower clusters use original textured cards and quality scaling"
	)
	check(camera_only, "flower-canopy blockers affect camera layer only")
	check_verdant_garden(garden)
	check(content_triangles < 200000, "bounded garden content stays below200k triangles")
	print("FOLIAGE_BUDGET: %d batches, %d content triangles" % [batches, content_triangles])
	var ledge := Node3D.new()
	check(
		nature.has_method("populate_ledge"), "cliff ledges share the batched botanical pine builder"
	)
	if nature.has_method("populate_ledge"):
		var points: Array[Vector3] = [
			Vector3(-32, 6, -36),
			Vector3(-25, 6, -42),
			Vector3(-21, 6, -42),
			Vector3(-26, 6, -28),
			Vector3(67, 33, -83)
		]
		nature.populate_ledge(ledge, 73110, points)
		var respects_elevation := true
		var branches_clear := true
		var retained_branches := 0
		for item in ledge.get_children():
			if item is MultiMeshInstance3D:
				for point in item.get_meta("instance_origins"):
					respects_elevation = respects_elevation and point.y > 6
					branches_clear = branches_clear and point.x > 0
					retained_branches += 1
		check(respects_elevation, "ledge pines preserve authored cliff elevation")
		check(
			branches_clear and retained_branches > 0,
			"authored ledge trees and overhanging branches stay out of shrine and covered route"
		)
	garden.free()
	replica.free()
	ledge.free()
	print("FOLIAGE_RESULT: %d checks, %d failures" % [checks, failures])
	quit(1 if failures else 0)


func check_verdant_garden(garden: Node3D) -> void:
	var required := {
		"AncientBoughs": false,
		"AncientLeaves": false,
		"WisteriaVines": false,
		"WisteriaLeaves": false,
		"WisteriaRacemes": false,
		"PlantedEdgeLeaves": false,
		"ForestUnderstory": false,
		"MossCarpets": false,
		"FallenPetals": false
	}
	var hanging_inside := true
	var ground_detail_clear := true
	var monumental_branches := false
	var card_crowns := false
	var detail_faces_up := true
	var scaled_counts: Dictionary = {}
	var woody_counts: Dictionary = {}
	for item in garden.get_children():
		if not item is MultiMeshInstance3D:
			continue
		for label in required:
			if str(item.name).begins_with(label):
				required[label] = item.multimesh.instance_count > 0
		if str(item.name).begins_with("AncientBoughs"):
			var bounds: AABB = item.custom_aabb
			monumental_branches = bounds.size.y >= 8 and bounds.size.x >= 8
		if str(item.name).begins_with("AncientLeaves"):
			card_crowns = item.multimesh.mesh is ArrayMesh and triangles(item.multimesh.mesh) <= 6
		if str(item.name).begins_with("WisteriaRacemes"):
			for point in item.get_meta("instance_origins"):
				hanging_inside = (
					hanging_inside
					and absf(point.x) > 9.5
					and absf(point.x) < 17
					and point.z > 3.5
					and point.z < 12.5
					and point.y > 2.6
					and point.y < 4.5
				)
		if str(item.name).begins_with("MossCarpets") or str(item.name).begins_with("FallenPetals"):
			for point in item.get_meta("instance_origins"):
				ground_detail_clear = ground_detail_clear and not NATURE.new().route_or_water(point)
			var arrays: Array = item.multimesh.mesh.surface_get_arrays(0)
			for normal in arrays[Mesh.ARRAY_NORMAL]:
				detail_faces_up = detail_faces_up and normal.y > 0.75
		if item.get_meta("density_scaled", false):
			scaled_counts[item] = item.multimesh.instance_count
		else:
			woody_counts[item] = item.multimesh.instance_count
	for label in required:
		check(required[label], "verdant garden contains real %s geometry" % label)
	check(monumental_branches, "ancient tree has an eight-meter branching silhouette")
	check(card_crowns, "ancient tree crown uses layered botanical cards")
	check(hanging_inside, "wisteria hangs on the authored pergolas outside walking axis")
	check(ground_detail_clear, "moss and fallen petals preserve all clear routes")
	check(detail_faces_up, "ground moss and petals face the camera above the floor")
	var world: Node3D = load("res://scripts/world.gd").new()
	world.nature = garden
	world.apply_quality("performance")
	var fewer := 0
	for item in scaled_counts:
		if item.multimesh.visible_instance_count < scaled_counts[item]:
			fewer += 1
	check(fewer > 12, "performance preset thins spatial botanical groups")
	world.apply_quality("high")
	var restored := true
	for item in scaled_counts:
		restored = restored and item.multimesh.visible_instance_count == scaled_counts[item]
	for item in woody_counts:
		restored = restored and item.multimesh.instance_count == woody_counts[item]
	check(restored, "high quality restores foliage and preserves all woody silhouettes")
	world.free()


func check_leaf_atlas() -> void:
	var atlas := Image.new()
	atlas.load_png_from_buffer(
		FileAccess.get_file_as_bytes("res://assets/materials/botanical_atlas.png")
	)
	var visible := 0
	var woody := 0
	for x in range(0, atlas.get_width() / 2, 4):
		for y in range(0, atlas.get_height() / 2, 4):
			var color := atlas.get_pixel(x, y)
			if color.a <= 0.5:
				continue
			visible += 1
			if color.r > color.g * 1.12 and color.g > color.b * 1.12:
				woody += 1
	check(float(woody) / maxf(visible, 1) < 0.08, "leaf cards avoid dominant dark wooden stripes")
	check(visible > 3200 and visible < 10000, "leaf sprays retain full leaves and transparent gaps")
