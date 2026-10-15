extends SceneTree
## Real imported geometry, shared materials and conservative route clearance.

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
	var path := "res://scripts/celestial_district.gd"
	check(ResourceLoader.exists(path), "celestial dressing is available")
	if not ResourceLoader.exists(path):
		print("DRESSING_RESULT: %d checks, %d failures" % [checks, failures])
		quit(1)
		return
	var world := Node3D.new()
	root.add_child(world)
	var dressing: Node3D = load(path).new()
	world.add_child(dressing)
	dressing.build(world)
	await process_frame
	var batches := dressing.find_children("*", "MultiMeshInstance3D", true, false)
	check(batches.size() > 12, "ceremonial, market and planted details contain real mesh batches")
	var routes_clear := true
	var all_shadowless := true
	var geometry_present := true
	var reported_obstructions := 0
	var required := {
		"market_stall": false,
		"stone_guardian": false,
		"planter": false,
		"balustrade": false,
		"incense_burner": false
	}
	var shared_import_materials := true
	var submitted_surfaces := 0
	var placement_counts_match := true
	for batch in batches:
		for label in required:
			if str(batch.name).begins_with("Dressing_" + label):
				required[label] = true
				for surface_index in range(batch.multimesh.mesh.get_surface_count()):
					var surface: Material = batch.multimesh.mesh.surface_get_material(surface_index)
					shared_import_materials = (
						shared_import_materials
						and surface != null
						and surface.resource_name.begins_with("Celestial")
					)
		all_shadowless = (
			all_shadowless and batch.cast_shadow == GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		)
		var multi: MultiMesh = batch.multimesh
		submitted_surfaces += multi.mesh.get_surface_count()
		geometry_present = geometry_present and multi.mesh.get_surface_count() > 0
		# Dummy rendering has no GPU transform readback. These are the same CPU
		# placements submitted to each MultiMesh; geometry is the real asset mesh.
		var placements: Array = batch.get_meta("instance_transforms", [])
		placement_counts_match = (
			placement_counts_match and placements.size() == multi.instance_count
		)
		if placements.size() != multi.instance_count:
			continue
		for i in range(multi.instance_count):
			var bounds: AABB = placements[i] * multi.mesh.get_aabb()
			if bounds.position.y > 2.0 or bounds.end.y < 0.0:
				continue
			var central := AABB(Vector3(-8, 0, -25), Vector3(16, 2, 48))
			var gate := AABB(Vector3(20, 0, -6), Vector3(34, 2, 4))
			var bridge := AABB(Vector3(-38, 0, -1), Vector3(18, 2, 4))
			if (
				reported_obstructions < 5
				and (
					bounds.intersects(central)
					or bounds.intersects(gate)
					or bounds.intersects(bridge)
				)
			):
				print("ROUTE CLEARANCE: %s instance%d %s" % [batch.name, i, bounds])
				reported_obstructions += 1
			routes_clear = (
				routes_clear
				and not bounds.intersects(central)
				and not bounds.intersects(gate)
				and not bounds.intersects(bridge)
			)
	check(routes_clear, "actual visible dressing geometry leaves all walking corridors clear")
	check(placement_counts_match, "all CPU placements match the submitted instance counts")
	for label in required:
		check(required[label], "imported original module is present: " + label)
	check(
		shared_import_materials,
		"all imported dressing surfaces use the shared architectural palette"
	)
	check(submitted_surfaces < 180, "spatial street batches stay under 180 submitted surfaces")
	check(geometry_present, "each instance batch has nonempty real mesh geometry")
	check(all_shadowless, "repeated street details do not multiply shadow passes")
	var palette = load("res://scripts/architectural_palette.gd")
	var stone: StandardMaterial3D = palette.material_for("Stone")
	check(
		stone == palette.material_for("Stone"), "architecture reuses one material per palette name"
	)
	check(
		stone.albedo_texture != null and stone.normal_enabled and stone.normal_texture != null,
		"shared stone uses original albedo and normal maps"
	)
	var balanced_visible := 0
	for batch in batches:
		balanced_visible += int(batch.visible)
	dressing.apply_quality("performance")
	var low_visible := 0
	for batch in batches:
		low_visible += int(batch.visible)
	check(
		low_visible < balanced_visible, "performance quality removes optional tiny street clutter"
	)
	dressing.apply_quality("balanced")
	var restored := 0
	for batch in batches:
		restored += int(batch.visible)
	check(restored == balanced_visible, "balanced quality restores authored street details")
	var before := dressing.get_child_count()
	dressing.build(world)
	check(dressing.get_child_count() == before, "rebuilding dressing never duplicates props")
	world.free()
	print("DRESSING_RESULT: %d checks, %d failures" % [checks, failures])
	quit(1 if failures else 0)
