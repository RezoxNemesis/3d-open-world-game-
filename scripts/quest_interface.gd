extends Control
## Contextual quest actions and a schematic, world-linked north-up minimap.

signal overlay_changed

var scene: Node3D
var quest: Node
var activities: Node
var player: CharacterBody3D
var exploration: Node
var minimap: Control
var context_button: Button
var dialog_overlay: Control
var dialog_panel: PanelContainer
var primary_button: Button
var dialogue_text: RichTextLabel
var title_label: Label
var header_label: Label
var dialog_open := false
var mode := "keeper"
var safe_rect := Rect2()


class JourneyMinimap:
	extends Control

	var player: CharacterBody3D
	var exploration: Node
	var quest: Node

	func project(point: Vector3) -> Vector2:
		var delta := Vector2(point.x - player.position.x, point.z - player.position.z)
		var radius := size.x * 0.39
		return size * 0.5 + (delta * radius / 60.0).limit_length(radius)

	func facing_arrow() -> PackedVector2Array:
		var arrow := PackedVector2Array()
		for point in [Vector2(0, -8), Vector2(5, 5), Vector2(0, 2), Vector2(-5, 5)]:
			arrow.append(size * 0.5 + point.rotated(-player.yaw))
		return arrow

	func _draw() -> void:
		if not is_instance_valid(player):
			return
		var center := size * 0.5
		var radius := size.x * 0.48
		draw_circle(center, radius, Color(0.025, 0.085, 0.09, 0.88))
		draw_arc(center, radius, 0, TAU, 64, Color(0.87, 0.75, 0.52, 0.7), 1.4, true)
		for line in [
			[Vector3(-30, 0, 1), Vector3.ZERO],
			[Vector3(-30, 0, 1), Vector3(-30, 0, -3.5)],
			[Vector3(-30, 0, -3.5), Vector3(-30, 6, -20.5)],
			[Vector3(-30, 6, -20.5), Vector3(-30, 6, -36.5)],
			[Vector3(-30, 6, -36.5), Vector3(-32, 6, -42)],
			[Vector3.ZERO, Vector3(0, 0, -16)],
			[Vector3.ZERO, Vector3(50, 0, -2.6)],
			[Vector3(50, 0, -2.6), Vector3(50, 10, -32)],
			[Vector3(50, 10, -32), Vector3(46, 10, -42)]
		]:
			draw_line(project(line[0]), project(line[1]), Color(0.6, 0.69, 0.58, 0.35), 1.5, true)
		for landmark in exploration.landmarks:
			var known: bool = exploration.discovered.has(landmark.id)
			var color := Color("e5c47e") if known else Color("718c88")
			draw_circle(project(landmark.position), 3.5, color)
		if quest.stage < 3:
			var target: Vector3 = quest.RELIC_POSITION if quest.stage == 1 else quest.GUIDE_POSITION
			var icon := project(target)
			draw_colored_polygon(
				PackedVector2Array(
					[
						icon + Vector2(0, -6),
						icon + Vector2(5, 0),
						icon + Vector2(0, 6),
						icon + Vector2(-5, 0)
					]
				),
				Color("a6e0c5")
			)
		draw_colored_polygon(facing_arrow(), Color("fff0be"))

		draw_string(
			ThemeDB.fallback_font,
			Vector2(center.x - 5, 18),
			"N",
			HORIZONTAL_ALIGNMENT_LEFT,
			-1,
			13,
			Color("dfc184")
		)


func setup(
	owner_scene: Node3D,
	story: Node,
	discoveries: Node,
	traveler: CharacterBody3D,
	activities: Node = null
) -> void:
	scene = owner_scene
	quest = story
	exploration = discoveries
	player = traveler
	self.activities = activities
	name = "JourneyInterface"
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	minimap = JourneyMinimap.new()
	minimap.player = player
	minimap.exploration = exploration
	minimap.quest = quest
	minimap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(minimap)
	context_button = Button.new()
	context_button.custom_minimum_size = Vector2(228, 56)
	context_button.add_theme_font_size_override("font_size", 18)
	scene.style_button(context_button)
	context_button.pressed.connect(interact)
	add_child(context_button)
	_build_dialogue()
	refresh()


func _build_dialogue() -> void:
	dialog_overlay = Control.new()
	add_child(dialog_overlay)
	var backdrop := ColorRect.new()
	backdrop.color = Color(0.01, 0.025, 0.03, 0.75)
	dialog_overlay.add_child(backdrop)
	backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dialog_panel = PanelContainer.new()
	dialog_panel.add_theme_stylebox_override("panel", scene.panel_style())
	dialog_overlay.add_child(dialog_panel)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 15)
	dialog_panel.add_child(box)
	title_label = scene.make_label("TEMPLE REALM  ·  FORGOTTEN LANTERN", 20, scene.GOLD)
	box.add_child(title_label)
	header_label = scene.make_label("KEEPER SEN", 24, scene.PALE)
	box.add_child(header_label)
	dialogue_text = RichTextLabel.new()
	dialogue_text.add_theme_font_size_override("normal_font_size", 20)
	dialogue_text.add_theme_color_override("default_color", scene.PALE)
	dialogue_text.custom_minimum_size.y = 120
	dialogue_text.scroll_active = false
	dialogue_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	dialogue_text.size_flags_vertical = Control.SIZE_EXPAND_FILL
	box.add_child(dialogue_text)
	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", 16)
	box.add_child(actions)
	primary_button = Button.new()
	primary_button.custom_minimum_size = Vector2(230, 56)
	primary_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	primary_button.add_theme_font_size_override("font_size", 18)
	scene.style_button(primary_button)
	primary_button.pressed.connect(_advance)
	actions.add_child(primary_button)
	var close := Button.new()
	close.text = "CLOSE"
	close.custom_minimum_size = Vector2(130, 56)
	close.add_theme_font_size_override("font_size", 18)
	scene.style_button(close)
	close.pressed.connect(close_dialog)
	actions.add_child(close)
	dialog_overlay.hide()


func resize(safe: Rect2, viewport_size: Vector2) -> void:
	safe_rect = safe
	size = viewport_size
	var diameter := 128.0 if safe.size.y < 600 else 140.0
	minimap.size = Vector2.ONE * diameter
	minimap.position = Vector2(safe.end.x - diameter - 24, safe.position.y + 118)
	context_button.position = Vector2(safe.end.x - 490, safe.end.y - 156)
	dialog_overlay.size = viewport_size
	var panel_size := Vector2(minf(680, safe.size.x - 64), minf(350, safe.size.y - 48))
	dialog_panel.size = panel_size
	dialog_panel.position = safe.position + (safe.size - panel_size) * 0.5


func refresh() -> void:
	if not is_instance_valid(quest):
		return
	var other_overlay: bool = scene.map_overlay.visible or scene.settings_overlay.visible
	minimap.visible = not dialog_open and not other_overlay
	minimap.queue_redraw()
	var current := _context()
	context_button.visible = not dialog_open and not other_overlay and current != ""
	match current:
		"relic":
			context_button.text = "RECOVER LANTERN"
		"keeper":
			context_button.text = "SPEAK TO SEN"
		"bell":
			context_button.text = "RING SHRINE BELL"
		_:
			context_button.text = "READ INSCRIPTION"


func interact() -> void:
	if dialog_open or scene.map_overlay.visible or scene.settings_overlay.visible:
		return
	var current := _context()
	if current == "relic":
		if quest.collect():
			scene.show_notice("Jade lantern recovered · Return to Keeper Sen")
	elif current == "keeper":
		open_dialog()
	elif current == "bell":
		open_bell()
	elif current != "":
		open_record(current)
	refresh()


func open_dialog() -> bool:
	if quest.context() != "keeper":
		return false
	mode = "keeper"
	title_label.text = "TEMPLE REALM  ·  FORGOTTEN LANTERN"
	header_label.text = "KEEPER SEN"
	dialogue_text.scroll_active = false
	dialogue_text.text = [
		(
			"The jade lantern once guided travelers through these mountains. "
			+ "Follow the eastern gate, climb the stone stairway, and recover it from the upper Sky Temple."
		),
		(
			"Beyond the eastern gate, turn south onto the stair approach, "
			+ "then climb north to the Sky Temple. The jade lantern is waiting on the upper terrace."
		),
		(
			"You brought its light home. Carry this lantern on your travels, "
			+ "and let the old paths shine again."
		),
		(
			"The lantern is yours now. Explore the gardens, discover each landmark, "
			+ "and return whenever you need a quiet moment."
		)
	][quest.stage]
	primary_button.text = ["ACCEPT JOURNEY", "CONTINUE JOURNEY", "RETURN LANTERN", "FAREWELL"][
		quest.stage
	]
	_show_dialog()
	return true


func open_record(id: String) -> bool:
	if not is_instance_valid(activities) or not activities.RECORDS.has(id):
		return false
	var record: Dictionary = activities.RECORDS[id]
	if player.position.distance_to(record.position) > 2.8:
		return false
	# read_record owns unique progression; an earned record remains readable nearby.
	activities.read_record(id)
	mode = "record"
	title_label.text = "TEMPLE REALM  ·  MOUNTAIN CHRONICLES"
	header_label.text = record.title
	dialogue_text.text = record.text
	dialogue_text.scroll_active = false
	primary_button.text = "CLOSE RECORD"
	_show_dialog()
	return true


func open_journal() -> void:
	mode = "journal"
	title_label.text = "TEMPLE REALM  ·  MOUNTAIN CHRONICLES"
	header_label.text = "TRAVELER'S JOURNAL"
	var entries: PackedStringArray = []
	if is_instance_valid(activities):
		for id in activities.RECORDS:
			if activities.records.has(id):
				var record: Dictionary = activities.RECORDS[id]
				entries.append(str(record.title) + "\n" + str(record.text))
	dialogue_text.text = (
		"\n\n".join(entries)
		if not entries.is_empty()
		else (
			"Your journal is waiting for its first inscription. "
			+ "Visit the scholar hall, western bridge and fox shrine to remember their stories."
		)
	)
	dialogue_text.scroll_active = true
	primary_button.text = "CLOSE JOURNAL"
	_show_dialog()


func open_bell() -> bool:
	if not is_instance_valid(activities):
		return false
	if player.position.distance_to(activities.BELL_POSITION) > 2.7:
		return false
	mode = "bell"
	title_label.text = "TEMPLE REALM  ·  SACRED FOX SHRINE"
	header_label.text = "THE SHRINE BELL"
	dialogue_text.scroll_active = false
	primary_button.text = "CLOSE"
	if activities.blessed:
		dialogue_text.text = (
			"The bell's promise travels with you. Your jade seal remembers the three paths "
			+ "and the lantern returned to Keeper Sen."
		)
	elif activities.records.size() == 3 and quest.stage == 3:
		dialogue_text.text = (
			"You have remembered the scholar, bridge and fox shrine, and returned the keeper's lantern. "
			+ "Ring the bell to carry the mountain's promise as a jade seal."
		)
		primary_button.text = "RING SHRINE BELL"
	else:
		dialogue_text.text = (
			"The bell waits for three remembered paths and one returned light. "
			+ "Read all three inscriptions and complete Keeper Sen's lantern journey.\n\n"
			+ (
				"Chronicles: %d / 3 · Lantern: %s"
				% [activities.records.size(), "returned" if quest.stage == 3 else "awaiting return"]
			)
		)
	_show_dialog()
	return true


func _show_dialog() -> void:
	dialogue_text.scroll_to_line(0)
	dialog_open = true
	dialog_overlay.show()
	overlay_changed.emit()
	refresh()


func _context() -> String:
	var current: String = quest.context()
	if current == "keeper" or current == "relic":
		return current
	return activities.context() if is_instance_valid(activities) else ""


func close_dialog() -> void:
	dialog_open = false
	dialog_overlay.hide()
	overlay_changed.emit()
	refresh()


func _advance() -> void:
	if mode == "keeper":
		if quest.stage == 0:
			quest.accept()
		elif quest.stage == 2:
			if quest.deliver():
				scene.show_notice("Journey complete · Jade lantern equipped")
	elif mode == "bell" and is_instance_valid(activities):
		if activities.ring_bell():
			scene.show_notice("Shrine blessed · Jade seal earned")
	close_dialog()
