package com.arena.compoundmanagement.controller;

import com.arena.compoundmanagement.dto.RegisterRequest;
import com.arena.compoundmanagement.service.UserRegistrationService;
import jakarta.validation.Valid;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.validation.BindingResult;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;

@Controller
public class AuthController {

    private final UserRegistrationService userRegistrationService;

    public AuthController(UserRegistrationService userRegistrationService) {
        this.userRegistrationService = userRegistrationService;
    }

    @GetMapping("/register")
    public String registerForm(Model model) {
        if (!model.containsAttribute("registerRequest")) {
            model.addAttribute("registerRequest", new RegisterRequest());
        }
        return "register";
    }

    @PostMapping("/register")
    public String register(@Valid @ModelAttribute("registerRequest") RegisterRequest registerRequest,
                           BindingResult bindingResult) {
        if (!registerRequest.getPassword().equals(registerRequest.getConfirmPassword())) {
            bindingResult.rejectValue("confirmPassword", "password.mismatch", "Passwords do not match");
        }

        if (userRegistrationService.usernameExists(registerRequest.getUsername())) {
            bindingResult.rejectValue("username", "username.exists", "Username already exists");
        }

        if (userRegistrationService.emailExists(registerRequest.getEmail())) {
            bindingResult.rejectValue("email", "email.exists", "Email already exists");
        }

        if (bindingResult.hasErrors()) {
            return "register";
        }

        userRegistrationService.register(registerRequest);
        return "redirect:/login?registered";
    }
}
