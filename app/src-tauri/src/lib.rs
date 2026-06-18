use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, Manager};

// Comando llamado desde el frontend cada segundo para mostrar el cronómetro
// en la barra de menú del Mac (visible aunque estés en otra app).
#[tauri::command]
fn set_tray_title(app: tauri::AppHandle, title: String) {
    if let Some(tray) = app.tray_by_id("main-tray") {
        let value = if title.is_empty() { None } else { Some(title) };
        let _ = tray.set_title(value);
    }
}

// Segundos de inactividad de TODO el Mac (no solo de la ventana de CURVA).
// Así, trabajar en Notion u otra app NO se marca como inactivo.
#[tauri::command]
fn system_idle_seconds() -> u64 {
    user_idle::UserIdle::get_time()
        .map(|t| t.as_seconds())
        .unwrap_or(0)
}

// Contexto de foco: devuelve "NombreApp|TítuloVentana".
// - Nombre de app: vía `lsappinfo` (sin permiso).
// - Título de ventana: vía System Events (best-effort; requiere permiso de
//   Accesibilidad). Sirve para ver qué hay DENTRO del navegador (p. ej. YouTube
//   dentro de Atlas), porque el título de la ventana lleva el nombre de la página.
#[tauri::command]
fn frontmost_app() -> String {
    let app = {
        let out = std::process::Command::new("sh")
            .arg("-c")
            .arg("lsappinfo info -only name \"$(lsappinfo front)\"")
            .output();
        out.ok()
            .and_then(|o| {
                if o.status.success() {
                    let s = String::from_utf8_lossy(&o.stdout);
                    s.find('=')
                        .map(|i| s[i + 1..].trim().trim_matches('"').trim().to_string())
                } else {
                    None
                }
            })
            .unwrap_or_default()
    };

    let title = {
        let script = "tell application \"System Events\" to get title of front window of (first application process whose frontmost is true)";
        std::process::Command::new("osascript")
            .arg("-e")
            .arg(script)
            .output()
            .ok()
            .and_then(|o| {
                if o.status.success() {
                    Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
                } else {
                    None
                }
            })
            .unwrap_or_default()
    };

    format!("{}|{}", app, title)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Menú del tray: controlar el cronómetro sin abrir la ventana.
            let open_i = MenuItem::with_id(app, "open", "Abrir CURVA", true, None::<&str>)?;
            let stop_i =
                MenuItem::with_id(app, "stop", "Detener cronómetro", true, None::<&str>)?;
            let quit_i = PredefinedMenuItem::quit(app, Some("Salir"))?;
            let sep = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(app, &[&open_i, &stop_i, &sep, &quit_i])?;

            // Ícono + título en la barra de menú (status bar de macOS).
            TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .title("⏱ CURVA")
                .tooltip("CURVA · Tiempos")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                    "stop" => {
                        // Avisa al frontend que detenga el cronómetro.
                        let _ = app.emit("tray-stop", ());
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_tray_title,
            system_idle_seconds,
            frontmost_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
