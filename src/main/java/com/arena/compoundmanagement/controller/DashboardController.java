package com.arena.compoundmanagement.controller;

import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

import java.security.Principal;

@Controller
public class DashboardController {

    @GetMapping("/")
    public String dashboard(Model model, Principal principal) {
        model.addAttribute("username", principal != null ? principal.getName() : "Engineer");
        return "dashboard";
    }

    @GetMapping("/login")
    public String login() {
        return "login";
    }
}
