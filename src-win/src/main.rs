// The native game host is implemented in main.cpp. The real entry point is
// mainEntryPoint, linked by build.rs; this file only supplies the no_std
// runtime stubs required by Cargo.
#![no_main]
#![no_std]

#[panic_handler]
fn panic(_info: &core::panic::PanicInfo) -> ! {
    loop {}
}
