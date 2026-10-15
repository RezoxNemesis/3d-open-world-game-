extends SceneTree


class ClimateWorld:
	extends Node3D
	var biome := "Jade Highlands"

	func biome_name() -> String:
		return biome


class AtmosphereProbe:
	extends Node3D
	var latest: Dictionary = {}

	func apply_weather_profile(profile: Dictionary, _blend: float) -> void:
		latest = profile


var checks := 0
var failures := 0


func _initialize() -> void:
	call_deferred("run")


func check(condition: bool, label: String) -> void:
	checks += 1
	if condition:
		print("PASS: " + label)
	else:
		failures += 1
		push_error("FAIL: " + label)


func run() -> void:
	check(ResourceLoader.exists("res://scripts/expedition_weather.gd"), "expedition weather exists")
	if failures:
		finish()
		return
	var scene := Node3D.new()
	root.add_child(scene)
	var world := ClimateWorld.new()
	var player := CharacterBody3D.new()
	var atmosphere := AtmosphereProbe.new()
	scene.add_child(world)
	scene.add_child(player)
	scene.add_child(atmosphere)
	var weather = load("res://scripts/expedition_weather.gd").new()
	scene.add_child(weather)
	weather.setup(world, player, atmosphere)
	weather.set_process(false)
	weather.set_autonomous(false)
	for pair in [
		[6.0, "sunrise"], [11.0, "day"], [16.0, "afternoon"], [19.0, "evening"], [23.0, "night"]
	]:
		check(weather.set_time(pair[0]), "time control accepts each lighting phase")
		weather.advance(1.0)
		check(weather.get_status().phase == pair[1], "time control reaches named lighting phase")
	check(weather.set_time(24.0) and weather.snapshot().time_of_day == 0, "midnight wraps safely")
	var previous: Dictionary = weather.snapshot()
	for invalid_time in [-1.0, 24.1, INF, NAN]:
		check(not weather.set_time(invalid_time), "invalid time rejected")
		check(weather.snapshot() == previous, "invalid time preserves environment")
	for season in ["summer", "autumn", "winter"]:
		check(weather.set_season(season), "each season is selectable")
		check(weather.get_status().season == season, "selected season reaches status")
	for kind in ["clear", "rain", "snow", "auto"]:
		check(weather.set_weather(kind), "each weather is selectable")
		check(weather.get_status().weather == kind, "selected weather reaches status")
	check(not weather.set_weather("storm-of-fire"), "unknown weather rejected")
	check(not weather.set_season("none"), "unknown season rejected")
	weather.set_weather("snow")
	weather.advance(1.0)
	var early: float = weather.precipitation
	check(early > 0 and early < 1, "precipitation starts with a smooth bounded transition")
	for index in range(15):
		weather.advance(1.0)
	check(weather.precipitation > early, "precipitation transition converges")
	check(
		weather._snow.emitting and not weather._rain.emitting,
		"snow selects only bounded snow particles"
	)
	weather.set_submerged(true)
	weather.advance(1.0)
	check(
		not weather._rain.visible and not weather._snow.visible,
		"underwater camera hides precipitation"
	)
	weather.set_submerged(false)
	weather.advance(1.0)
	check(weather._snow.emitting, "leaving water restores active weather")
	for quality in ["performance", "balanced", "high"]:
		weather.apply_quality(quality)
		check(
			weather._rain.amount <= 480 and weather._snow.amount <= 320,
			"quality keeps precipitation within mobile cap"
		)
	var initial_resets: int = weather.get_status().get("precipitation_resets", 0)
	player.position = Vector3(123, 47, -81)
	weather.advance(0.1)
	check(
		weather._rain.global_position.distance_to(player.global_position + Vector3(0, 9, 0)) < 0.01,
		"precipitation follows rebased local player"
	)
	check(
		weather.get_status().get("precipitation_resets", 0) == initial_resets + 1,
		"large coordinate jumps reset old-frame particles"
	)
	player.position.x += 1
	weather.advance(0.1)
	check(
		weather.get_status().get("precipitation_resets", 0) == initial_resets + 1,
		"ordinary walking preserves continuous precipitation"
	)
	weather.set_weather("clear")
	for index in range(25):
		weather.advance(1.0)
	check(
		not weather._rain.emitting and not weather._snow.emitting, "clear skies stop precipitation"
	)
	weather.set_weather("auto")
	world.biome = "Mistpine Frontier"
	weather.advance(1.0)
	check(weather.get_status().climate == "alpine", "regional climate reads actual biome")
	weather.set_time(12.0)
	weather.advance(1.0)
	var day_energy: float = atmosphere.latest.sun_energy
	weather.set_time(0.0)
	weather.advance(1.0)
	check(atmosphere.latest.sun_energy < day_energy, "night reduces real directional light target")
	check(atmosphere.latest.moon_energy > 0, "night enables moon illumination")
	check(atmosphere.latest.ambient_energy >= 0.34, "night retains navigable ambient visibility")
	check(atmosphere.latest.fog_density <= 0.0025, "weather haze remains bounded")
	var frozen: float = weather.snapshot().time_of_day
	weather.advance(2.0)
	check(weather.snapshot().time_of_day == frozen, "manual clock remains fixed")
	weather.set_autonomous(true)
	weather.advance(2.0)
	check(weather.snapshot().time_of_day > frozen, "autonomous clock advances without input")
	check_snapshot_validation(weather)
	scene.queue_free()
	await process_frame
	await check_real_atmosphere()
	finish()


func check_real_atmosphere() -> void:
	var scene := Node3D.new()
	root.add_child(scene)
	var world := ClimateWorld.new()
	world.biome = "Mistpine Frontier"
	scene.add_child(world)
	var player := CharacterBody3D.new()
	scene.add_child(player)
	var ground := MeshInstance3D.new()
	ground.mesh = PlaneMesh.new()
	var original := ShaderMaterial.new()
	original.shader = Shader.new()
	original.shader.code = (
		"shader_type spatial; uniform vec3 biome_tint = vec3(1.0);"
		+ "void fragment() { ALBEDO=biome_tint; }"
	)
	original.set_shader_parameter("biome_tint", Color(0.5, 0.7, 0.4))
	var original_tint: Variant = original.get_shader_parameter("biome_tint")
	ground.mesh.surface_set_material(0, original)
	world.add_child(ground)
	var leaves := MeshInstance3D.new()
	leaves.mesh = QuadMesh.new()
	var original_leaves := ShaderMaterial.new()
	original_leaves.shader = load("res://assets/shaders/garden_foliage.gdshader")
	original_leaves.set_shader_parameter("wind_strength", 0.075)
	leaves.mesh.surface_set_material(0, original_leaves)
	world.add_child(leaves)
	var sea := Node3D.new()
	sea.name = "AzureSea"
	world.add_child(sea)
	var sea_grass := MeshInstance3D.new()
	sea_grass.mesh = leaves.mesh
	sea.add_child(sea_grass)
	var atmosphere = load("res://scripts/expedition_atmosphere.gd").new()
	scene.add_child(atmosphere)
	atmosphere.setup(world, player)
	atmosphere.set_process(false)
	atmosphere.weather.set_process(false)
	atmosphere.weather.set_autonomous(false)
	atmosphere.weather.set_time(0.0)
	atmosphere.weather.set_season("winter")
	for index in range(24):
		atmosphere.weather.advance(1.0)
	atmosphere._bind_season_materials()
	atmosphere._apply_season_materials()
	check(sea_grass.material_override == null, "underwater plants are excluded from seasonal snow")
	check(atmosphere._sun.light_energy < 0.01, "real night sun fades away")
	check(atmosphere._moon.light_energy > 0.40, "real moon provides night light")
	check(
		atmosphere._environment.ambient_light_energy >= 0.34,
		"real night environment remains readable"
	)
	check(
		not atmosphere._environment.volumetric_fog_enabled,
		"Compatibility weather never enables volumetric fog"
	)
	check(atmosphere._environment.fog_density < 0.0025, "real environment avoids blanket haze")
	check(
		atmosphere._sky_material.get_shader_parameter("night") > 0.98,
		"real sky receives night/star state"
	)
	check(
		ground.material_override != original,
		"seasonal ground material is scoped to expedition instance"
	)
	check(
		ground.material_override.get_shader_parameter("snow_cover") > 0.65,
		"winter snow reaches actual terrain material"
	)
	check(
		original.get_shader_parameter("biome_tint") == original_tint,
		"season does not mutate shared terrain palette"
	)
	check(
		leaves.material_override.get_shader_parameter("snow_cover") > 0.65,
		"winter snow reaches actual foliage material"
	)
	check(
		is_equal_approx(leaves.material_override.get_shader_parameter("wind_strength"), 0.075),
		"season retains original foliage wind settings"
	)
	atmosphere.apply_quality("balanced")
	check(
		atmosphere._sun.directional_shadow_max_distance <= 40,
		"balanced shadows remain within forty meters"
	)
	atmosphere.apply_quality("high")
	check(
		atmosphere._sun.directional_shadow_max_distance == 80, "high retains extended shadow range"
	)
	atmosphere.apply_quality("performance")
	check(
		not atmosphere._sun.shadow_enabled and not atmosphere._moon.shadow_enabled,
		"performance night adds no shadow map"
	)
	player.position = Vector3(300, 42, -600)
	atmosphere._anchor_backdrop()
	check(
		atmosphere._backdrop.global_position == Vector3(300, 0, -600),
		"weather preserves local horizon anchoring"
	)
	ground.queue_free()
	leaves.queue_free()
	await process_frame
	atmosphere._apply_season_materials()
	check(atmosphere._season_bindings.is_empty(), "unloaded seasonal materials do not accumulate")
	scene.queue_free()
	await process_frame


func check_snapshot_validation(weather: Node3D) -> void:
	var saved: Dictionary = weather.snapshot()
	check(weather.restore(saved), "environment snapshot restores")
	check(weather.snapshot() == saved, "environment roundtrip is exact")
	for key in ["time_of_day", "weather", "season", "autonomous", "version"]:
		var missing := saved.duplicate()
		missing.erase(key)
		check(not weather.restore(missing), "incomplete environment rejected")
		check(weather.snapshot() == saved, "failed restore remains atomic")
	for patch in [
		{"time_of_day": true},
		{"time_of_day": INF},
		{"time_of_day": 25},
		{"weather": []},
		{"season": "unknown"},
		{"autonomous": 1},
		{"version": true},
		{"version": 2}
	]:
		var malformed := saved.duplicate()
		malformed.merge(patch, true)
		check(not weather.restore(malformed), "malformed environment rejected")
		check(weather.snapshot() == saved, "malformed environment preserves settings")
	check(not weather.restore(null), "null environment rejected")


func finish() -> void:
	print("EXPEDITION WEATHER: %d checks, %d failures" % [checks, failures])
	quit(1 if failures else 0)
