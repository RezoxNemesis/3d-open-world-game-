extends Node3D
## A bounded local climate: one sun, one moon and two capped CPU particle fields.
## Clock/settings persist; lighting and seasonal materials ease toward their targets.

const WEATHERS := ["auto", "clear", "rain", "snow"]
const SEASONS := ["summer", "autumn", "winter"]
const HOURS_PER_SECOND := 1.0 / 60.0
const WEATHER_PERIOD := 90.0

var time_of_day := 9.5
var weather_name := "auto"
var season := "summer"
var autonomous := true
var precipitation := 0.0
var _world: Node3D
var _player: CharacterBody3D
var _atmosphere: Node3D
var _rain: CPUParticles3D
var _snow: CPUParticles3D
var _quality := "balanced"
var _elapsed := 0.0
var _resolved := "clear"
var _climate := "temperate"
var _snow_blend := 0.0
var _submerged := false
var _anchor_ready := false
var _last_anchor := Vector3.ZERO
var _precipitation_resets := 0


func setup(world: Node3D, player: CharacterBody3D, atmosphere: Node3D) -> void:
	_world = world
	_player = player
	_atmosphere = atmosphere
	name = "ExpeditionWeather"
	if _rain == null:
		_rain = _particles(false)
		_snow = _particles(true)
		add_child(_rain)
		add_child(_snow)
	apply_quality(_quality)
	advance(0.0)


func set_time(hours: float) -> bool:
	if not is_finite(hours) or hours < 0 or hours > 24:
		return false
	time_of_day = fposmod(hours, 24.0)
	return true


func set_weather(value: String) -> bool:
	if value not in WEATHERS:
		return false
	weather_name = value
	return true


func set_season(value: String) -> bool:
	if value not in SEASONS:
		return false
	season = value
	return true


func set_autonomous(enabled: bool) -> void:
	autonomous = enabled


func set_submerged(submerged: bool) -> void:
	_submerged = submerged
	if _rain != null and submerged:
		_rain.emitting = false
		_snow.emitting = false
		_rain.visible = false
		_snow.visible = false


func snapshot() -> Dictionary:
	return {
		"version": 1,
		"time_of_day": time_of_day,
		"weather": weather_name,
		"season": season,
		"autonomous": autonomous
	}


func restore(data: Variant) -> bool:
	if not _valid_snapshot(data):
		return false
	time_of_day = fposmod(float(data.time_of_day), 24.0)
	weather_name = data.weather
	season = data.season
	autonomous = data.autonomous
	return true


func _valid_snapshot(data: Variant) -> bool:
	if not data is Dictionary:
		return false
	var version: Variant = data.get("version")
	var hours: Variant = data.get("time_of_day")
	return (
		typeof(version) in [TYPE_INT, TYPE_FLOAT]
		and version == 1
		and typeof(hours) in [TYPE_INT, TYPE_FLOAT]
		and is_finite(float(hours))
		and hours >= 0
		and hours <= 24
		and data.get("weather") is String
		and data.weather in WEATHERS
		and data.get("season") is String
		and data.season in SEASONS
		and data.get("autonomous") is bool
	)


func get_status() -> Dictionary:
	return {
		"time_of_day": time_of_day,
		"phase": phase_name(),
		"weather": weather_name,
		"resolved_weather": _resolved,
		"season": season,
		"autonomous": autonomous,
		"climate": _climate,
		"precipitation": precipitation,
		"precipitation_resets": _precipitation_resets
	}


func phase_name() -> String:
	if time_of_day >= 5 and time_of_day < 8:
		return "sunrise"
	if time_of_day >= 8 and time_of_day < 14:
		return "day"
	if time_of_day >= 14 and time_of_day < 18:
		return "afternoon"
	if time_of_day >= 18 and time_of_day < 21:
		return "evening"
	return "night"


func apply_quality(preset: String) -> void:
	_quality = preset if preset in ["performance", "balanced", "high"] else "balanced"
	if _rain == null:
		return
	var amounts := {
		"performance": Vector2i(120, 80), "balanced": Vector2i(280, 180), "high": Vector2i(480, 320)
	}
	_rain.amount = amounts[_quality].x
	_snow.amount = amounts[_quality].y


func _process(delta: float) -> void:
	advance(delta)


func advance(delta: float) -> void:
	if not is_finite(delta) or delta < 0 or not is_instance_valid(_atmosphere):
		return
	var step := minf(delta, 2.0)
	if autonomous:
		time_of_day = fposmod(time_of_day + step * HOURS_PER_SECOND, 24.0)
	_elapsed += step
	_climate = _region_climate()
	_resolved = _regional_weather() if weather_name == "auto" else weather_name
	var target := 0.0 if _resolved == "clear" else (0.68 if _climate == "arid" else 1.0)
	var blend := 1.0 - exp(-step * 0.42)
	precipitation = lerpf(precipitation, target, blend)
	_snow_blend = lerpf(_snow_blend, 1.0 if _resolved == "snow" else 0.0, blend)
	if _rain != null:
		var anchor := Vector3.ZERO
		if is_instance_valid(_player):
			anchor = _player.global_position + Vector3(0, 9, 0)
		if _anchor_ready and anchor.distance_squared_to(_last_anchor) > 1024.0:
			# CPU particles use world coordinates so rain does not cling to a
			# walking camera. A rebase/atlas jump must discard the old frame.
			_rain.restart()
			_snow.restart()
			_precipitation_resets += 1
		_last_anchor = anchor
		_anchor_ready = true
		_rain.global_position = anchor
		_snow.global_position = anchor
		_rain.emitting = not _submerged and precipitation * (1.0 - _snow_blend) > 0.08
		_snow.emitting = not _submerged and precipitation * _snow_blend > 0.08
		_rain.visible = _rain.emitting
		_snow.visible = _snow.emitting
	_atmosphere.apply_weather_profile(lighting_profile(), blend)


func _region_climate() -> String:
	var biome := ""
	if is_instance_valid(_world) and _world.has_method("biome_name"):
		biome = str(_world.biome_name())
	if biome.contains("Amber"):
		return "arid"
	if biome.contains("Mistpine"):
		return "alpine"
	if biome.contains("Rosewood"):
		return "blossom"
	return "temperate"


func _regional_weather() -> String:
	# Fair arrival weather preserves visibility; regional showers then pass
	# naturally. Arid regions receive fewer wet intervals than wooded highlands.
	var interval := int(_elapsed / WEATHER_PERIOD)
	var period := 5 if _climate == "arid" else 3
	if interval % period != 1:
		return "clear"
	return "snow" if season == "winter" or _climate == "alpine" else "rain"


func lighting_profile() -> Dictionary:
	var solar := (time_of_day - 6.0) * TAU / 24.0
	var direction := Vector3(-cos(solar), sin(solar), 0.32).normalized()
	var daylight := smoothstep(-0.12, 0.24, direction.y)
	var golden := 1.0 - smoothstep(0.08, 0.68, absf(direction.y))
	var zenith := Color("17243f").lerp(Color("3f769b"), daylight)
	var horizon := Color("344664").lerp(Color("bfd3d2"), daylight)
	horizon = horizon.lerp(Color("dba079"), golden * daylight * 0.48)
	zenith = zenith.lerp(Color("647789"), precipitation * 0.45 * daylight)
	horizon = horizon.lerp(Color("9caeaf"), precipitation * 0.36 * daylight)
	var seasonal_tint := Color.WHITE
	var snow_cover := 0.0
	if season == "autumn":
		seasonal_tint = Color(1.15, 0.83, 0.48)
	elif season == "winter":
		seasonal_tint = Color(0.80, 0.90, 0.94)
		snow_cover = 0.72 if _climate == "alpine" else 0.48
	return {
		"zenith": zenith,
		"horizon": horizon,
		"sun_direction": direction,
		"sun_color": Color("ffe3b5").lerp(Color("ffaf70"), golden * 0.55),
		"sun_energy": daylight * (0.96 - precipitation * 0.46),
		"moon_energy": (1.0 - daylight) * 0.46,
		"ambient_color": Color("9cb6db").lerp(Color("bcc7c1"), daylight),
		"ambient_energy": lerpf(0.40, 0.34, daylight) + precipitation * 0.025,
		"fog_color": horizon.lerp(zenith, 0.24),
		"fog_density": lerpf(0.00085, 0.00135, daylight) + precipitation * 0.00065,
		"cloud_cover": 0.22 + precipitation * 0.54,
		"night": 1.0 - daylight,
		"season_tint": seasonal_tint,
		"snow_cover": snow_cover,
		"wetness": precipitation * (1.0 - _snow_blend)
	}


func _particles(snow: bool) -> CPUParticles3D:
	var particles := CPUParticles3D.new()
	particles.name = "LocalSnow" if snow else "LocalRain"
	particles.emitting = false
	particles.visible = false
	particles.local_coords = false
	particles.lifetime = 7.0 if snow else 1.4
	particles.preprocess = 0.6
	particles.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
	particles.emission_box_extents = Vector3(9, 0.6, 9)
	particles.direction = Vector3.DOWN
	particles.spread = 18.0 if snow else 3.0
	particles.gravity = Vector3(0.28, -0.65, 0.12) if snow else Vector3(0.6, -15, 0.2)
	particles.initial_velocity_min = 0.5 if snow else 7.0
	particles.initial_velocity_max = 1.1 if snow else 9.0
	particles.scale_amount_min = 0.65
	particles.scale_amount_max = 1.0
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.albedo_color = Color("d8e6ec") if snow else Color("9bb9c9")
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	if snow:
		var flake := SphereMesh.new()
		flake.radius = 0.034
		flake.height = 0.068
		flake.radial_segments = 4
		flake.rings = 1
		flake.material = material
		particles.mesh = flake
	else:
		var streak := QuadMesh.new()
		streak.size = Vector2(0.014, 0.34)
		material.billboard_mode = BaseMaterial3D.BILLBOARD_FIXED_Y
		streak.material = material
		particles.mesh = streak
	particles.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return particles
