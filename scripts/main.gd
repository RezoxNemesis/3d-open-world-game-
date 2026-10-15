extends Node3D

const GOLD := Color("dfc184")
const PALE := Color("e4e8df")
const MUTED := Color("aab9b5")

var storage = preload("res://scripts/save_store.gd").new()
var settings = preload("res://scripts/game_settings.gd").new()
var settings_path := "user://settings.json"
var journey_path := "user://save.json"
var autosave_enabled := OS.has_feature("android")
var checkpoint: Node
var activities: Node
var powers: Node
var power_controls: Control
var exploration: Node
var quest: Node
var quest_ui: Control
var story_objective: Label
var status: Label
var objective: Label
var notice: Label
var location: Label
var hud_panel: PanelContainer
var map_overlay: Control
var map_panel: PanelContainer
var map_diagram: Control
var map_buttons: Dictionary = {}
var settings_overlay: Control
var settings_panel: PanelContainer
var quality_buttons: Dictionary = {}
var settings_sliders: Dictionary = {}
var setting_values: Dictionary = {}
var quality_description: Label
var settings_notice: Label
var sprint_assist_toggle: CheckButton
var settings_save_time := 0.0
var settings_dirty := false
var notice_time := 0.0
var hud_time := 0.0
var _transitioning := false


class DistrictDiagram:
	extends Control

	var player_position := Vector3.ZERO

	func project(position: Vector3) -> Vector2:
		return Vector2(
			size.x * 0.5 + position.x * size.x / 128.0, size.y * 0.67 + position.z * size.y / 100.0
		)

	func _draw() -> void:
		var center := project(Vector3.ZERO)
		draw_rect(Rect2(Vector2.ZERO, size), Color(0.06, 0.12, 0.13, 0.94))
		for x in range(1, 9):
			var x_position := size.x * float(x) / 9.0
			draw_line(
				Vector2(x_position, 0),
				Vector2(x_position, size.y),
				Color(0.65, 0.77, 0.70, 0.065),
				1.0
			)
		for y in range(1, 6):
			var y_position := size.y * float(y) / 6.0
			draw_line(
				Vector2(0, y_position),
				Vector2(size.x, y_position),
				Color(0.65, 0.77, 0.70, 0.065),
				1.0
			)
		draw_circle(project(Vector3(-31, 0, 7)), size.y * 0.13, Color(0.13, 0.35, 0.35, 0.75))
		for target in [Vector3(-30, 0, 1), Vector3(0, 1.8, -16), Vector3(30, 0, -4)]:
			draw_line(center, project(target), Color(0.78, 0.65, 0.39, 0.30), 5.0, true)
		draw_line(
			project(Vector3(30, 0, -4)),
			project(Vector3(50, 0, -2.6)),
			Color(0.78, 0.65, 0.39, 0.30),
			4.0,
			true
		)
		draw_line(
			project(Vector3(50, 0, -2.6)),
			project(Vector3(46, 10, -42)),
			Color(0.78, 0.65, 0.39, 0.30),
			4.0,
			true
		)
		draw_line(
			project(Vector3(-30, 0, 1)),
			project(Vector3(-32, 6, -42)),
			Color(0.78, 0.65, 0.39, 0.30),
			4.0,
			true
		)
		var player := project(player_position)
		draw_circle(player, 11, Color(0.83, 0.71, 0.47, 0.25))
		draw_circle(player, 5, Color("f8df9f"))
		draw_arc(player, 9, 0, TAU, 32, Color("e2c789"), 1.0, true)
		draw_string(
			ThemeDB.fallback_font,
			Vector2(size.x - 27, 26),
			"N",
			HORIZONTAL_ALIGNMENT_LEFT,
			-1,
			16,
			Color("dfc184")
		)


func _enter_tree() -> void:
	var bindings := {
		"move_forward": [KEY_W, KEY_UP],
		"move_backward": [KEY_S, KEY_DOWN],
		"move_left": [KEY_A, KEY_LEFT],
		"move_right": [KEY_D, KEY_RIGHT],
		"jump": [KEY_SPACE],
		"toggle_view": [],
		"save_game": [],
		"load_game": [],
		"map_game": [KEY_M],
		"settings_game": [KEY_ESCAPE],
		"interact_game": [KEY_E],
		"sprint": [KEY_SHIFT]
	}
	for action in bindings:
		if not InputMap.has_action(action):
			InputMap.add_action(action)
			for code in bindings[action]:
				var event := InputEventKey.new()
				event.physical_keycode = code
				InputMap.action_add_event(action, event)


func _ready() -> void:
	if get_tree().root.has_meta("journey_return_path"):
		journey_path = str(get_tree().root.get_meta("journey_return_path"))
		get_tree().root.remove_meta("journey_return_path")
	exploration = preload("res://scripts/exploration.gd").new()
	exploration.name = "Exploration"
	add_child(exploration)
	exploration.changed.connect(_progress_changed)
	var mobile = preload("res://scripts/mobile_controls.gd").new()
	mobile.name = "MobileControls"
	add_child(mobile)
	var canvas := CanvasLayer.new()
	canvas.layer = 2
	canvas.name = "HUD"
	add_child(canvas)
	hud_panel = PanelContainer.new()
	hud_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud_panel.add_theme_stylebox_override("panel", panel_style())
	canvas.add_child(hud_panel)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 5)
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud_panel.add_child(box)
	var title := make_label("TEMPLE REALM  ·  JOURNEY", 19, GOLD)
	box.add_child(title)
	location = make_label("TEMPLE COURTYARD", 14, MUTED)
	box.add_child(location)
	objective = make_label("", 19, PALE)
	box.add_child(objective)
	status = make_label("", 15, MUTED)
	box.add_child(status)
	story_objective = make_label("", 15, GOLD)
	story_objective.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(story_objective)
	notice = make_label("", 16, GOLD)
	box.add_child(notice)
	notice.hide()
	build_map(canvas)
	settings.load_settings(settings_path)
	_build_settings(canvas)
	quest = preload("res://scripts/lantern_quest.gd").new()
	quest.name = "LanternQuest"
	add_child(quest)
	quest.setup(get_node("Player"), get_node("World"))
	quest.changed.connect(_progress_changed)
	activities = preload("res://scripts/world_activities.gd").new()
	add_child(activities)
	activities.setup(get_node("Player"), get_node("World"), quest)
	activities.changed.connect(_progress_changed)
	powers = preload("res://scripts/hero_powers.gd").new()
	add_child(powers)
	powers.setup(get_node("Player"), get_node("World"))
	powers.changed.connect(_progress_changed)
	power_controls = preload("res://scripts/hero_power_controls.gd").new()
	canvas.add_child(power_controls)
	power_controls.setup(self, powers)
	quest_ui = preload("res://scripts/quest_interface.gd").new()
	canvas.add_child(quest_ui)
	quest_ui.setup(self, quest, exploration, get_node("Player"), activities)
	quest_ui.overlay_changed.connect(_quest_overlay_changed)
	apply_settings()
	get_viewport().size_changed.connect(resize_hud)
	resize_hud()
	update_hud()
	checkpoint = preload("res://scripts/journey_checkpoint.gd").new()
	add_child(checkpoint)
	checkpoint.setup(self, journey_path, autosave_enabled)
	checkpoint.start()
	if get_tree().root.get_meta("return_to_journey", false):
		get_tree().root.remove_meta("return_to_journey")
		load_game(journey_path, true)
	print(
		"TEMPLE_REALM_READY: connected temple district, exploration quest and mobile HUD initialized"
	)


func panel_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.035, 0.095, 0.095, 0.83)
	style.border_color = Color(GOLD, 0.48)
	style.set_border_width_all(1)
	style.set_corner_radius_all(12)
	style.content_margin_left = 16
	style.content_margin_right = 16
	style.content_margin_top = 12
	style.content_margin_bottom = 10
	return style


func make_label(text: String, font_size: int, color: Color) -> Label:
	var label := Label.new()
	label.text = text
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	return label


func build_map(canvas: CanvasLayer) -> void:
	map_overlay = Control.new()
	map_overlay.name = "DistrictMap"
	canvas.add_child(map_overlay)
	var backdrop := ColorRect.new()
	backdrop.color = Color(0.01, 0.025, 0.03, 0.76)
	backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	map_overlay.add_child(backdrop)
	map_panel = PanelContainer.new()
	map_panel.add_theme_stylebox_override("panel", panel_style())
	map_overlay.add_child(map_panel)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 12)
	map_panel.add_child(box)
	var header := HBoxContainer.new()
	box.add_child(header)
	var title := make_label("EASTERN TEMPLE DISTRICT", 22, GOLD)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title)
	var close := Button.new()
	close.text = "CLOSE  ×"
	close.custom_minimum_size = Vector2(108, 42)
	style_button(close)
	close.pressed.connect(toggle_map)
	header.add_child(close)
	box.add_child(
		make_label("Discover landmarks on foot, then tap a waypoint to travel.", 17, MUTED)
	)
	map_diagram = DistrictDiagram.new()
	map_diagram.custom_minimum_size = Vector2(560, 240)
	map_diagram.size_flags_vertical = Control.SIZE_EXPAND_FILL
	map_diagram.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.add_child(map_diagram)
	for landmark in exploration.landmarks:
		var button := Button.new()
		button.custom_minimum_size = Vector2(148, 48)
		button.pressed.connect(travel_from_map.bind(str(landmark.id)))
		button.add_theme_font_size_override("font_size", 16)
		style_button(button)
		map_diagram.add_child(button)
		map_buttons[landmark.id] = button
	box.add_child(make_label("●  Your position     —  Courtyard paths", 16, MUTED))
	var expedition_button := Button.new()
	expedition_button.text = "EXPLORE THE JADE EXPANSE  ·  World expedition"
	expedition_button.custom_minimum_size.y = 46
	style_button(expedition_button)
	expedition_button.pressed.connect(begin_expedition)
	box.add_child(expedition_button)
	map_overlay.hide()


func begin_expedition() -> void:
	if _transitioning:
		return
	if not write_journey(get_node("Player").position, journey_path):
		show_notice("Could not save journey; try again")
		return
	_transitioning = true
	get_tree().root.set_meta("journey_return_path", journey_path)
	get_node("Player").set_physics_process(false)
	get_node("MobileControls").release_all_actions()
	power_controls.release_all_actions()
	get_node("World/GardenAmbience").process_mode = Node.PROCESS_MODE_DISABLED
	for audio in get_node("World/GardenAmbience").find_children(
		"*", "AudioStreamPlayer", true, false
	):
		audio.stop()
		audio.stream = null
	var drain_until := Time.get_ticks_msec() + 160
	while Time.get_ticks_msec() < drain_until:
		await get_tree().process_frame
	get_tree().change_scene_to_file("res://scenes/expedition.tscn")


func _build_settings(canvas: CanvasLayer) -> void:
	settings_overlay = Control.new()
	settings_overlay.name = "JourneySettings"
	canvas.add_child(settings_overlay)
	var backdrop := ColorRect.new()
	backdrop.color = Color(0.01, 0.025, 0.03, 0.80)
	backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	settings_overlay.add_child(backdrop)
	settings_panel = PanelContainer.new()
	settings_panel.add_theme_stylebox_override("panel", panel_style())
	settings_overlay.add_child(settings_panel)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 12)
	settings_panel.add_child(box)
	var header := HBoxContainer.new()
	box.add_child(header)
	var title := make_label("TEMPLE REALM · SETTINGS", 23, GOLD)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title)
	var close := Button.new()
	close.text = "CLOSE  ×"
	close.custom_minimum_size = Vector2(116, 48)
	style_button(close)
	close.pressed.connect(toggle_settings)
	header.add_child(close)
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	box.add_child(scroll)
	var content := VBoxContainer.new()
	content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	content.add_theme_constant_override("separation", 13)
	scroll.add_child(content)
	content.add_child(make_label("VISUAL QUALITY", 17, GOLD))
	var qualities := HBoxContainer.new()
	qualities.add_theme_constant_override("separation", 10)
	content.add_child(qualities)
	for preset in ["performance", "balanced", "high"]:
		var button := Button.new()
		button.text = str(preset).capitalize()
		button.custom_minimum_size = Vector2(140, 48)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.add_theme_font_size_override("font_size", 19)
		style_button(button)
		button.pressed.connect(_change_quality.bind(preset))
		qualities.add_child(button)
		quality_buttons[preset] = button
	quality_description = make_label("", 16, MUTED)
	quality_description.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	content.add_child(quality_description)
	_build_setting_slider(content, "sensitivity", "Look sensitivity", 0.4, 2.0, 0.05)
	_build_setting_slider(content, "joystick_scale", "Movement pad size", 0.75, 1.4, 0.05)
	_build_setting_slider(content, "camera_distance", "Camera distance", 3.5, 8.0, 0.25)
	sprint_assist_toggle = CheckButton.new()
	sprint_assist_toggle.text = "Sprint at the edge of the movement pad"
	sprint_assist_toggle.custom_minimum_size.y = 48
	sprint_assist_toggle.add_theme_font_size_override("font_size", 17)
	sprint_assist_toggle.toggled.connect(_change_setting.bind("sprint_assist"))
	content.add_child(sprint_assist_toggle)
	var restore_crags := Button.new()
	restore_crags.name = "RestoreMountainCrags"
	restore_crags.text = "RESTORE MOUNTAIN CRAGS"
	restore_crags.custom_minimum_size.y = 48
	style_button(restore_crags)
	restore_crags.pressed.connect(_restore_crags)
	content.add_child(restore_crags)
	var utilities := HBoxContainer.new()
	utilities.add_theme_constant_override("separation", 12)
	box.add_child(utilities)
	for item in [
		["SAVE", save_game],
		["LOAD", load_game],
		["JOURNAL", _open_journal],
		["RESET", _reset_settings]
	]:
		var button := Button.new()
		button.text = item[0]
		button.custom_minimum_size = Vector2(160, 48)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.add_theme_font_size_override("font_size", 16)
		style_button(button)
		button.pressed.connect(item[1])
		utilities.add_child(button)
	content.add_child(make_label("Hold RUN to sprint · Swipe the right side to look", 16, MUTED))
	settings_notice = make_label("", 17, GOLD)
	box.add_child(settings_notice)
	settings_overlay.hide()


func _build_setting_slider(
	box: VBoxContainer, key: String, title: String, low: float, high: float, step: float
) -> void:
	var heading := HBoxContainer.new()
	box.add_child(heading)
	var label := make_label(title, 18, PALE)
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	heading.add_child(label)
	var value := make_label("", 18, GOLD)
	heading.add_child(value)
	setting_values[key] = value
	var slider := HSlider.new()
	slider.min_value = low
	slider.max_value = high
	slider.step = step
	slider.custom_minimum_size = Vector2(0, 48)
	var track := StyleBoxFlat.new()
	track.bg_color = Color("2c4544")
	track.set_corner_radius_all(4)
	track.content_margin_top = 4
	track.content_margin_bottom = 4
	slider.add_theme_stylebox_override("slider", track)
	var fill := track.duplicate() as StyleBoxFlat
	fill.bg_color = Color(GOLD, 0.72)
	slider.add_theme_stylebox_override("grabber_area", fill)
	slider.add_theme_stylebox_override("grabber_area_highlight", fill)
	var gradient := Gradient.new()
	gradient.offsets = PackedFloat32Array([0.0, 0.65, 0.78, 0.88, 1.0])
	gradient.colors = PackedColorArray([PALE, PALE, GOLD, Color(GOLD, 0.0), Color(GOLD, 0.0)])
	var grabber := GradientTexture2D.new()
	grabber.gradient = gradient
	grabber.width = 36
	grabber.height = 36
	grabber.fill = GradientTexture2D.FILL_RADIAL
	grabber.fill_from = Vector2(0.5, 0.5)
	grabber.fill_to = Vector2(1.0, 0.5)
	slider.add_theme_icon_override("grabber", grabber)
	slider.add_theme_icon_override("grabber_highlight", grabber)
	slider.value_changed.connect(_change_setting.bind(key))
	box.add_child(slider)
	settings_sliders[key] = slider


func _change_quality(preset: String) -> void:
	_change_setting(preset, "quality")


func _change_setting(value: Variant, key: String) -> void:
	if settings.set_value(key, value):
		settings_dirty = true
		settings_save_time = 0.7
		apply_settings()


func _reset_settings() -> void:
	settings.reset_defaults()
	settings_dirty = true
	apply_settings()
	_save_settings_if_dirty()
	show_notice("Settings reset")


func apply_settings() -> void:
	var preset: String = settings.values.quality
	get_viewport().scaling_3d_scale = {"performance": 0.70, "balanced": 0.85, "high": 1.0}[preset]
	get_viewport().msaa_3d = {
		"performance": Viewport.MSAA_DISABLED,
		"balanced": Viewport.MSAA_2X,
		"high": Viewport.MSAA_4X
	}[preset]
	get_viewport().positional_shadow_atlas_size = 1024 if preset == "high" else 512
	get_node("World").apply_quality(preset)
	get_node("MobileControls").configure_controls(
		settings.values.sensitivity, settings.values.joystick_scale, settings.values.sprint_assist
	)
	sprint_assist_toggle.set_pressed_no_signal(settings.values.sprint_assist)
	get_node("Player").set_camera_distance(settings.values.camera_distance)
	for key in settings_sliders:
		settings_sliders[key].set_value_no_signal(settings.values[key])
		setting_values[key].text = (
			"%.1f m" % settings.values[key]
			if key == "camera_distance"
			else "%.2f×" % settings.values[key]
		)
	for key in quality_buttons:
		quality_buttons[key].modulate = PALE if key == preset else Color(0.65, 0.76, 0.73)
		quality_buttons[key].text = ("●  " if key == preset else "") + str(key).capitalize()
	quality_description.text = {
		"performance": "Lighter scenery and fewer shadows favor smoother play.",
		"balanced": "Balanced scenery and shadows. A good starting point for mobile.",
		"high": "Full scenery, longer shadows and sharper rendering. Uses more power."
	}[preset]


func _save_settings_if_dirty() -> void:
	if settings_dirty:
		settings_dirty = not settings.save_settings(settings_path)
		if settings_dirty:
			show_notice("Could not save settings")


func style_button(button: Button) -> void:
	var normal := panel_style()
	normal.bg_color = Color("10292c")
	normal.content_margin_top = 8
	normal.content_margin_bottom = 8
	button.add_theme_stylebox_override("normal", normal)
	var hover := normal.duplicate() as StyleBoxFlat
	hover.bg_color = Color("2b4543")
	hover.border_color = GOLD
	button.add_theme_stylebox_override("hover", hover)
	button.add_theme_stylebox_override("pressed", hover)
	var disabled := normal.duplicate() as StyleBoxFlat
	disabled.bg_color = Color("102020")
	disabled.border_color = Color(GOLD, 0.17)
	button.add_theme_stylebox_override("disabled", disabled)
	button.add_theme_color_override("font_color", GOLD)
	button.add_theme_color_override("font_hover_color", PALE)
	button.add_theme_color_override("font_pressed_color", PALE)
	button.add_theme_color_override("font_disabled_color", Color("75827c"))


func resize_hud() -> void:
	var viewport_size := get_viewport().get_visible_rect().size
	var safe := Rect2(Vector2.ZERO, viewport_size)
	if OS.has_feature("mobile"):
		var physical := Vector2(DisplayServer.window_get_size())
		if physical.x > 0 and physical.y > 0:
			var screen_safe := DisplayServer.get_display_safe_area()
			var scale := viewport_size / physical
			safe = Rect2(Vector2(screen_safe.position) * scale, Vector2(screen_safe.size) * scale)
			if safe.size.x <= 0 or safe.size.y <= 0:
				safe = Rect2(Vector2.ZERO, viewport_size)
	hud_panel.position = safe.position + Vector2(22, 22)
	hud_panel.custom_minimum_size = Vector2(minf(356, safe.size.x - 310), 0)
	hud_panel.size = Vector2.ZERO
	map_overlay.size = viewport_size
	var panel_size := Vector2(minf(900, safe.size.x - 64), minf(540, safe.size.y - 56))
	map_panel.position = safe.position + (safe.size - panel_size) * 0.5
	map_panel.size = panel_size
	settings_overlay.size = viewport_size
	var setting_size := Vector2(minf(860, safe.size.x - 48), minf(590, safe.size.y - 48))
	settings_panel.position = safe.position + (safe.size - setting_size) * 0.5
	settings_panel.size = setting_size
	if is_instance_valid(quest_ui):
		quest_ui.resize(safe, viewport_size)
	if is_instance_valid(power_controls):
		power_controls.resize(safe, viewport_size)
	update_map.call_deferred()


func update_hud() -> void:
	var player := get_node("Player") as CharacterBody3D
	objective.text = exploration.current_objective()
	if is_instance_valid(quest):
		story_objective.text = quest.summary() if quest.stage < 3 else activities.summary()
	if is_instance_valid(quest_ui):
		quest_ui.refresh()
	location.text = "TEMPLE COURTYARD"
	for landmark in exploration.landmarks:
		var point: Vector3 = landmark.position
		if (
			(
				Vector2(player.position.x, player.position.z).distance_to(Vector2(point.x, point.z))
				< 10
			)
			and absf(player.position.y - point.y) <= 3.0
		):
			location.text = str(landmark.name).to_upper()
			break
	var next_distance := -1.0
	for landmark in exploration.landmarks:
		if not exploration.discovered.has(landmark.id):
			var point: Vector3 = landmark.position
			next_distance = Vector2(player.position.x, player.position.z).distance_to(
				Vector2(point.x, point.z)
			)
			break
	status.text = (
		"%d / %d landmarks discovered"
		% [exploration.discovered.size(), exploration.landmarks.size()]
	)
	if next_distance >= 0:
		status.text += "   •   %d m" % int(ceilf(next_distance))
	if map_overlay.visible:
		update_map()


func update_map() -> void:
	if not is_instance_valid(map_diagram):
		return
	map_diagram.player_position = get_node("Player").position
	map_diagram.queue_redraw()
	for landmark in exploration.landmarks:
		var button: Button = map_buttons[landmark.id]
		var unlocked: bool = exploration.discovered.has(landmark.id)
		button.disabled = not unlocked
		button.text = str(landmark.name) + ("\nTRAVEL" if unlocked else "\nUNDISCOVERED")
		button.position = map_diagram.project(landmark.position) - button.custom_minimum_size * 0.5


func toggle_map() -> void:
	map_overlay.visible = not map_overlay.visible
	if map_overlay.visible:
		settings_overlay.hide()
		if quest_ui.dialog_open:
			quest_ui.close_dialog()
		_save_settings_if_dirty()
		update_map()
	_sync_overlay_state()


func toggle_settings() -> void:
	settings_overlay.visible = not settings_overlay.visible
	if settings_overlay.visible:
		map_overlay.hide()
		if quest_ui.dialog_open:
			quest_ui.close_dialog()
	else:
		_save_settings_if_dirty()
	_sync_overlay_state()


func _quest_overlay_changed() -> void:
	if quest_ui.dialog_open:
		map_overlay.hide()
		settings_overlay.hide()
		_save_settings_if_dirty()
	_sync_overlay_state()


func _sync_overlay_state() -> void:
	var overlay_open: bool = map_overlay.visible or settings_overlay.visible or quest_ui.dialog_open
	quest_ui.refresh()
	var mobile := get_node("MobileControls")
	mobile.release_all_actions()
	mobile.visible = not overlay_open
	power_controls.release_all_actions()
	power_controls.visible = not overlay_open
	hud_panel.visible = not overlay_open
	get_node("Player").set_physics_process(not overlay_open)
	if overlay_open:
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE


func travel_from_map(id: String) -> void:
	if exploration.travel(id, get_node("Player")):
		toggle_map()
		show_notice("Arrived at discovered waypoint")
		update_hud()


func show_notice(message: String) -> void:
	notice.text = message
	notice.show()
	settings_notice.text = message
	notice_time = 3.0


func write_journey(position: Vector3, path: String) -> bool:
	return storage.save_state(
		position,
		exploration.discovered.keys(),
		path,
		quest.stage,
		activities.snapshot(),
		powers.snapshot()
	)


func save_game(path: String = "user://save.json") -> void:
	show_notice(
		(
			"Journey saved locally"
			if write_journey(get_node("Player").position, path)
			else "Save failed"
		)
	)


func load_game(path: String = "user://save.json", quiet: bool = false) -> bool:
	var player := get_node("Player") as CharacterBody3D
	var state: Dictionary = storage.load_state(path)
	if not state.valid:
		if not quiet:
			show_notice("No valid local journey found")
		return false
	if is_instance_valid(checkpoint):
		checkpoint.begin_restore()
	var restored_point: Vector3 = state.position
	get_node("World/Regions").update_regions(restored_point)
	player.position = restored_point
	player.velocity = Vector3.ZERO
	exploration.restore_discovered(state.discovered)
	quest.restore_stage(state.quest_stage)
	activities.restore_state(state.activity_state)
	powers.restore_state(state.hero_state)
	if is_instance_valid(checkpoint):
		checkpoint.finish_restore(true)
	update_hud()
	if not quiet:
		show_notice("Journey loaded")
	return true


func _progress_changed() -> void:
	update_hud()
	if is_instance_valid(checkpoint):
		checkpoint.request_save()


func _open_journal() -> void:
	quest_ui.open_journal()


func _restore_crags() -> void:
	var state: Dictionary = powers.snapshot()
	state.destroyed = []
	powers.restore_state(state)
	show_notice("Mountain crags restored")


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_F5:
			save_game()
		elif event.keycode == KEY_F9:
			load_game()


func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		_save_settings_if_dirty()
		if is_instance_valid(checkpoint):
			checkpoint.request_save()
			checkpoint.flush()


func _exit_tree() -> void:
	if settings_dirty:
		_save_settings_if_dirty()


func _process(delta: float) -> void:
	exploration.visit(get_node("Player").position)
	if Input.is_action_just_pressed("save_game") and Input.is_action_pressed("save_game"):
		save_game()
	elif Input.is_action_just_pressed("load_game") and Input.is_action_pressed("load_game"):
		load_game()
	if Input.is_action_just_pressed("map_game") and Input.is_action_pressed("map_game"):
		toggle_map()
	if Input.is_action_just_pressed("settings_game") and Input.is_action_pressed("settings_game"):
		if quest_ui.dialog_open:
			quest_ui.close_dialog()
		elif map_overlay.visible:
			toggle_map()
		else:
			toggle_settings()
	if Input.is_action_just_pressed("interact_game") and Input.is_action_pressed("interact_game"):
		quest_ui.interact()
	if settings_dirty:
		settings_save_time -= delta
		if settings_save_time <= 0:
			_save_settings_if_dirty()
	hud_time -= delta
	if hud_time <= 0:
		update_hud()
		hud_time = 0.2
	if notice_time > 0:
		notice_time -= delta
		if notice_time <= 0:
			notice.hide()
			settings_notice.text = ""
